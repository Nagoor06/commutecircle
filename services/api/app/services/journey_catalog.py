"""Read models for discovery, ride details and trip history."""

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from heapq import nsmallest
from itertools import islice
from types import SimpleNamespace

from sqlalchemy import func, select

from app.models import Booking, Commute, Journey, Ride, Ticket
from app.models.v2 import CircleMember, CommuterProfile, DriverVerification, VerifiedVehicle
from app.schemas.journey import Place
from app.services import journeys
from app.services.locations import distance_m

PAGE = 20
PICKUP_RADIUS_M = 2000


def driver_reviews(session, issuer, subject):
    totals = []
    for review, trip, owner in [
        (Booking, Ride, Ride.driver_subject),
        (Ticket, Journey, Journey.driver),
    ]:
        identity = Ride.driver_issuer if trip is Ride else Journey.issuer
        link = Booking.ride_id if review is Booking else Ticket.journey_id
        totals.append(
            session.execute(
                select(func.sum(review.stars), func.count(review.stars))
                .join(trip, link == trip.id)
                .where(identity == issuer, owner == subject)
            ).one()
        )
    count = sum(n for _, n in totals)
    return {
        "average": round(sum(total or 0 for total, _ in totals) / count, 1) if count else None,
        "count": count,
    }


def views(session, candidates, principal, now=None):
    rows = list(candidates)
    if not rows:
        return []
    now = now or datetime.now(UTC)
    by_trip = defaultdict(list)
    for ticket in session.scalars(
        select(Ticket).where(Ticket.journey_id.in_([j.id for j in rows]))
    ):
        by_trip[ticket.journey_id].append(ticket)
    result = []
    identities = {}
    for j in rows:
        key = (j.issuer, j.driver)
        if key not in identities:
            profile = session.get(CommuterProfile, key)
            verified = session.get(DriverVerification, key)
            identities[key] = (
                profile.display_name if profile else None,
                bool(verified and verified.status == "approved"),
            )
        name, driver_verified = identities[key]
        verified_car = session.get(VerifiedVehicle, j.vehicle_registration_id) if j.vehicle_registration_id else None
        car_verified = bool(verified_car and verified_car.status == "approved")
        vehicle = (
            {"make": verified_car.make, "model": verified_car.model, "color": verified_car.color,
             "verified": True}
            if car_verified else j.vehicle
        )
        driver = journeys.is_driver(j, principal)
        tickets = by_trip[j.id]
        result.append(
            dict(
                id=j.id,
                stops=j.stops,
                vehicle=vehicle,
                driver_name=name,
                driver_verified=driver_verified,
                vehicle_verified=car_verified,
                preferences=j.preferences or {},
                price_paise=j.price_paise,
                capacity=j.capacity,
                departure=journeys.utc(j.departure),
                cancelled=j.cancelled,
                booking_mode=j.booking_mode,
                vehicle_id=j.vehicle_registration_id,
                circle_id=j.circle_id if j.circle_id and (driver or (principal and session.get(CircleMember, (j.circle_id, principal.issuer, principal.subject)))) else None,
                owner=driver,
                free=journeys.inventory(j, tickets, now),
                tickets=[
                    journeys.receipt(t, now)
                    for t in tickets
                    if driver or journeys.is_rider(t, principal)
                ],
            )
        )
    return result


def gap(place, stop):
    if place is None:
        return None
    if place.lat is not None and stop.get("lat") is not None:
        return round(distance_m(place.lat, place.lon, stop["lat"], stop["lon"]))
    if " ".join(place.name.casefold().split()) == " ".join(stop["name"].casefold().split()):
        return 0
    return None


def near(place, stop, radius=PICKUP_RADIUS_M):
    distance = gap(place, stop)
    return place is None or (distance is not None and distance <= radius)


def segment(row, query, start, end, commute=None):
    stops = row["stops"]
    options = []
    for a, stop in enumerate(stops[:-1]):
        boarding = row["departure"] + timedelta(minutes=stop["minutes"])
        if (
            boarding <= start
            or (end and boarding >= end)
            or not near(query.origin, stop, query.radius_m)
        ):
            continue
        for b in range(a + 1, len(stops)):
            if (
                not near(query.destination, stops[b], query.destination_radius_m)
                or min(row["free"][a:b]) < query.min_seats
            ):
                continue
            price = journeys.fare(SimpleNamespace(**row), a, b)
            if query.max_fare_paise is not None and price > query.max_fare_paise:
                continue
            commute_match = bool(
                commute
                and near(commute[0], stop, query.radius_m)
                and near(commute[1], stops[b], query.destination_radius_m)
            )
            # Choose the closest actual stops in travel order, never a fictitious pickup.
            target = query.destination or (commute[1] if commute_match else None)
            source = query.origin or (commute[0] if commute_match else None)
            distance = (gap(source, stop) or 0) + (gap(target, stops[b]) or 0)
            options.append(((not commute_match, distance, a, -b), a, b, commute_match, price))
    return min(options) if options else None


def search(session, principal, query):
    now = datetime.now(UTC)
    start = max(now, query.after or now)
    stmt = select(Journey).where(Journey.cancelled.is_(False), Journey.circle_id.is_(None), Journey.last_stop_at > start)
    if query.before:
        stmt = stmt.where(Journey.departure < query.before)
    saved = (
        session.get(Commute, (principal.issuer, principal.subject))
        if principal and query.prefer_commute
        else None
    )
    commute = (Place(**saved.pickup), Place(**saved.workplace)) if saved else None
    candidates = iter(
        session.scalars(
            stmt.order_by(Journey.departure, Journey.id).execution_options(yield_per=80)
        )
    )
    ratings = {}

    def matches():
        while batch := list(islice(candidates, 80)):
            identities = {j.id: (j.issuer, j.driver) for j in batch}
            for row in views(session, batch, principal, now):
                if row["booking_mode"] == "approval" and not (row["driver_verified"] and row["vehicle_verified"]):
                    continue
                if any(
                    getattr(query, flag) and not row["preferences"].get(flag)
                    for flag in ("quiet", "air_conditioned")
                ):
                    continue
                selection = segment(row, query, start, query.before, commute)
                if not selection:
                    continue
                identity = identities[row["id"]]
                if identity not in ratings:
                    ratings[identity] = driver_reviews(session, *identity)
                row["driver_rating"] = ratings[identity]
                if query.min_rating and (row["driver_rating"]["average"] or 0) < query.min_rating:
                    continue
                _, a, b, commute_match, price = selection
                origin_gap = gap(query.origin, row["stops"][a])
                arrival_gap = gap(query.destination, row["stops"][b])
                boarding = row["departure"] + timedelta(minutes=row["stops"][a]["minutes"])
                common = (boarding, row["id"], a, b)
                rank = (
                    (price,)
                    if query.sort == "price"
                    else (arrival_gap if arrival_gap is not None else float("inf"),)
                    if query.sort == "arrival"
                    else (not commute_match, (origin_gap or 0) + (arrival_gap or 0))
                    if query.sort == "recommended"
                    else ()
                ) + common
                yield (
                    rank,
                    {
                        "journey": row,
                        "board": a,
                        "alight": b,
                        "match": {
                            "commute": commute_match,
                            "pickup_distance_m": origin_gap,
                            "dropoff_distance_m": arrival_gap,
                            "fare_paise": price,
                        },
                    },
                )

    # Keep only the requested page in memory even when sorting a large catalogue.
    selected = nsmallest(query.offset + PAGE + 1, matches(), key=lambda item: item[0])
    return {
        "items": [item for _, item in selected[query.offset : query.offset + PAGE]],
        "more": len(selected) > query.offset + PAGE,
    }
