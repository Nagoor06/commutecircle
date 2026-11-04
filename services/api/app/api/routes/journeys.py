from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.routes.bookings import DatabaseSession
from app.auth.dependencies import PublicReader, RideReader, RideWriter
from app.models.journey import Journey, Ticket
from app.schemas.journey import CancelTicket, ExitStop, Hold, Offer, RideSearch, Segment
from app.schemas.ride_details import Review
from app.services import journey_catalog as catalog
from app.services import journeys as service

router = APIRouter(prefix="/v1/journeys", tags=["priced journeys (sandbox)"])


@router.post("", status_code=201)
def offer(data: Offer, principal: RideWriter, session: DatabaseSession):
    stops = [s.model_dump(exclude_none=True) for s in data.stops]
    vehicle = data.vehicle.model_dump(mode="json") if data.vehicle else None
    preferences = data.preferences.model_dump()
    offer_id = str(data.offer_id) if data.offer_id else None

    def replay(existing):
        if (
            not service.is_driver(existing, principal)
            or existing.stops != stops
            or existing.vehicle != vehicle
            or (existing.preferences or {"quiet": False, "air_conditioned": False}) != preferences
            or service.utc(existing.departure) != data.departure
            or existing.price_paise != data.price_paise
            or existing.capacity != data.capacity
        ):
            raise HTTPException(
                409, "This offer already exists. Check My trips before publishing again."
            )
        return catalog.views(session, [existing], principal)[0]

    try:
        with session.begin():
            existing = session.get(Journey, offer_id) if offer_id else None
            if existing:
                return replay(existing)
            if data.departure <= datetime.now(UTC):
                raise HTTPException(422, "Departure must be in the future")
            j = Journey(
                issuer=principal.issuer,
                driver=principal.subject,
                departure=data.departure.astimezone(UTC),
                last_stop_at=data.departure + timedelta(minutes=data.stops[-1].minutes),
                stops=stops,
                vehicle=vehicle,
                preferences=preferences,
                price_paise=data.price_paise,
                capacity=data.capacity,
            )
            if offer_id:
                j.id = offer_id
            session.add(j)
            session.flush()
            return catalog.views(session, [j], principal)[0]
    except IntegrityError:
        existing = session.get(Journey, offer_id) if offer_id else None
        if not existing:
            raise
        return replay(existing)


@router.get("")
def discover(principal: PublicReader, session: DatabaseSession, offset: int = Query(0, ge=0)):
    rows = session.scalars(
        select(Journey)
        .where(Journey.cancelled.is_(False), Journey.last_stop_at > datetime.now(UTC))
        .order_by(Journey.departure, Journey.id)
        .offset(offset)
        .limit(50)
    )
    return catalog.views(session, rows, principal)


@router.get("/mine")
def history(principal: RideReader, session: DatabaseSession, offset: int = Query(0, ge=0)):
    own = (Journey.issuer == principal.issuer) & (Journey.driver == principal.subject)
    booked = select(Ticket.journey_id).where(
        Ticket.issuer == principal.issuer, Ticket.rider == principal.subject
    )
    rows = session.scalars(
        select(Journey)
        .where(own | Journey.id.in_(booked))
        .order_by(Journey.departure.desc(), Journey.id)
        .offset(offset)
        .limit(50)
    )
    return catalog.views(session, rows, principal)


@router.post("/search")
def find(data: RideSearch, principal: PublicReader, session: DatabaseSession):
    return catalog.search(session, principal, data)


@router.get("/{jid}")
def detail(jid: UUID, principal: PublicReader, session: DatabaseSession):
    j = session.get(Journey, str(jid))
    if not j:
        raise HTTPException(404, "Journey not found")
    row = catalog.views(session, [j], principal)[0]
    if (j.cancelled or service.utc(j.last_stop_at) <= datetime.now(UTC)) and not (
        row["owner"] or row["tickets"]
    ):
        raise HTTPException(404, "Journey not found")
    row["driver_rating"] = catalog.driver_reviews(session, j.issuer, j.driver)
    return row


@router.put("/{jid}/tickets/{tid}/rating")
def rate(jid: UUID, tid: UUID, data: Review, principal: RideWriter, session: DatabaseSession):
    with session.begin():
        trip = service.locked(session, str(jid))
        ticket = session.get(Ticket, str(tid))
        if not ticket or ticket.journey_id != trip.id or not service.is_rider(ticket, principal):
            raise HTTPException(404, "Reservation not found")
        if ticket.state != "exited" and (
            ticket.state != "paid" or datetime.now(UTC) < service.pickup(trip, ticket.alight)
        ):
            raise HTTPException(409, "Finish the booked segment before reviewing the driver.")
        ticket.stars = data.stars
    return data


@router.post("/{jid}/quote")
def quote(jid: UUID, data: Segment, principal: PublicReader, session: DatabaseSession):
    j = session.get(Journey, str(jid))
    if not j:
        raise HTTPException(404, "Journey not found")
    return service.quote(j, service.tickets(session, j), data, datetime.now(UTC))


@router.post("/{jid}/holds")
def reserve(jid: UUID, data: Hold, principal: RideWriter, session: DatabaseSession):
    try:
        return service.hold(session, str(jid), principal, data)
    except IntegrityError as exc:
        raise HTTPException(409, "Checkout ID conflict. Nothing charged.") from exc


@router.post("/{jid}/tickets/{tid}/sandbox-pay")
def pay(jid: UUID, tid: UUID, principal: RideWriter, session: DatabaseSession):
    return service.act(session, str(jid), str(tid), principal, "pay")


@router.post("/{jid}/tickets/{tid}/cancel")
def cancel(
    jid: UUID,
    tid: UUID,
    principal: RideWriter,
    session: DatabaseSession,
    data: CancelTicket | None = None,
):
    return service.act(
        session,
        str(jid),
        str(tid),
        principal,
        "cancel",
        max_fee_paise=data.max_fee_paise if data else None,
    )


@router.post("/{jid}/tickets/{tid}/exit")
def exit_at(jid: UUID, tid: UUID, data: ExitStop, principal: RideWriter, session: DatabaseSession):
    return service.act(session, str(jid), str(tid), principal, "exit", data.stop)


@router.post("/{jid}/cancel")
def cancel_journey(jid: UUID, principal: RideWriter, session: DatabaseSession):
    return service.cancel_all(session, str(jid), principal)
