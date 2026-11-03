"""Read models for discovery, ride details and trip history."""

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from itertools import islice

from sqlalchemy import func, select

from app.models import Booking, Journey, Ride, Ticket
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
    for j in rows:
        driver = journeys.is_driver(j, principal)
        tickets = by_trip[j.id]
        result.append(
            dict(
                id=j.id,
                stops=j.stops,
                vehicle=j.vehicle,
                price_paise=j.price_paise,
                capacity=j.capacity,
                departure=journeys.utc(j.departure),
                cancelled=j.cancelled,
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


def near(place, stop):
    if place is None:
        return True
    if place.lat is not None and stop.get("lat") is not None:
        return distance_m(place.lat, place.lon, stop["lat"], stop["lon"]) <= PICKUP_RADIUS_M
    return " ".join(place.name.casefold().split()) == " ".join(stop["name"].casefold().split())


def segment(row, query, start, end):
    stops = row["stops"]
    for a, stop in enumerate(stops[:-1]):
        boarding = row["departure"] + timedelta(minutes=stop["minutes"])
        if boarding <= start or (end and boarding >= end) or not near(query.origin, stop):
            continue
        # For browsing, prefer the longest available part of the ride.
        for b in range(len(stops) - 1, a, -1):
            if near(query.destination, stops[b]) and min(row["free"][a:b]) > 0:
                return a, b
    return None


def search(session, principal, query):
    now = datetime.now(UTC)
    start = max(now, query.after or now)
    stmt = select(Journey).where(Journey.cancelled.is_(False), Journey.last_stop_at > start)
    if query.before:
        stmt = stmt.where(Journey.departure < query.before)
    candidates = iter(
        session.scalars(
            stmt.order_by(Journey.departure, Journey.id).execution_options(yield_per=80)
        )
    )
    matches = []
    skipped = 0
    while batch := list(islice(candidates, 80)):
        for row in views(session, batch, principal, now):
            selection = segment(row, query, start, query.before)
            if not selection:
                continue
            if skipped < query.offset:
                skipped += 1
                continue
            a, b = selection
            matches.append({"journey": row, "board": a, "alight": b})
            if len(matches) > PAGE:
                return {"items": matches[:PAGE], "more": True}
    return {"items": matches, "more": False}
