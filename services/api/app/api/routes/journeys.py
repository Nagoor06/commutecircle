from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.routes.bookings import DatabaseSession
from app.auth.dependencies import RideReader, RideWriter
from app.models.journey import Journey, Ticket
from app.schemas.journey import ExitStop, Hold, Offer, Segment
from app.services import journeys as service

router = APIRouter(prefix="/v1/journeys", tags=["priced journeys (sandbox)"])


def view(session, j, p):
    rows = service.tickets(session, j)
    now = datetime.now(UTC)
    driver = service.is_driver(j, p)
    return dict(
        id=j.id,
        stops=j.stops,
        price_paise=j.price_paise,
        capacity=j.capacity,
        departure=service.utc(j.departure),
        cancelled=j.cancelled,
        owner=driver,
        free=service.inventory(j, rows, now),
        tickets=[service.receipt(t, now) for t in rows if driver or service.is_rider(t, p)],
    )


@router.post("", status_code=201)
def offer(data: Offer, principal: RideWriter, session: DatabaseSession):
    if data.departure <= datetime.now(UTC):
        raise HTTPException(422, "Departure must be in the future")
    j = Journey(
        issuer=principal.issuer,
        driver=principal.subject,
        departure=data.departure.astimezone(UTC),
        last_stop_at=data.departure + timedelta(minutes=data.stops[-1].minutes),
        stops=[s.model_dump() for s in data.stops],
        price_paise=data.price_paise,
        capacity=data.capacity,
    )
    with session.begin():
        session.add(j)
        session.flush()
        return view(session, j, principal)


@router.get("")
def discover(principal: RideReader, session: DatabaseSession, offset: int = Query(0, ge=0)):
    rows = session.scalars(
        select(Journey)
        .where(Journey.cancelled.is_(False), Journey.last_stop_at > datetime.now(UTC))
        .order_by(Journey.departure, Journey.id)
        .offset(offset)
        .limit(50)
    )
    return [view(session, j, principal) for j in rows]


@router.get("/mine")
def history(principal: RideReader, session: DatabaseSession, offset: int = Query(0, ge=0)):
    own = (Journey.issuer == principal.issuer) & (Journey.driver == principal.subject)
    booked = select(Ticket.journey_id).where(
        Ticket.issuer == principal.issuer, Ticket.rider == principal.subject
    )
    return [
        view(session, j, principal)
        for j in session.scalars(
            select(Journey)
            .where(own | Journey.id.in_(booked))
            .order_by(Journey.departure.desc(), Journey.id)
            .offset(offset)
            .limit(50)
        )
    ]


@router.post("/{jid}/quote")
def quote(jid: UUID, data: Segment, principal: RideReader, session: DatabaseSession):
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
def cancel(jid: UUID, tid: UUID, principal: RideWriter, session: DatabaseSession):
    return service.act(session, str(jid), str(tid), principal, "cancel")


@router.post("/{jid}/tickets/{tid}/exit")
def exit_at(jid: UUID, tid: UUID, data: ExitStop, principal: RideWriter, session: DatabaseSession):
    return service.act(session, str(jid), str(tid), principal, "exit", data.stop)


@router.post("/{jid}/cancel")
def cancel_journey(jid: UUID, principal: RideWriter, session: DatabaseSession):
    return service.cancel_all(session, str(jid), principal)
