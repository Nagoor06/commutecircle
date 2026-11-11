"""Driver-approved seat requests use Journey/Ticket as the only seat inventory."""

from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy.exc import IntegrityError

from app.api.routes.bookings import DatabaseSession
from app.auth.dependencies import RideReader, RideWriter
from app.models.journey import Journey, Ticket
from app.schemas.journey import Segment
from app.services import journeys
from app.services.v2_common import check_booking_eligibility, verify_access

router = APIRouter(prefix="/v1/journeys", tags=["V2 booking approvals"])


class SeatRequest(Segment):
    request_id: UUID
    consent: Literal[True]
    consent_version: Literal["cc-v2-1"]


def request_receipt(t):
    return {
        "id": t.id,
        "journey_id": t.journey_id,
        "state": journeys.status(t, datetime.now(UTC)),
        "board": t.board,
        "alight": t.alight,
        "fare_paise": t.fare,
        "expires": journeys.utc(t.expires),
    }


@router.post("/{jid}/requests", status_code=201)
def request_seat(jid: UUID, data: SeatRequest, principal: RideWriter, session: DatabaseSession):
    with session.begin():
        j = journeys.locked(session, str(jid))
        verify_access(session, j, principal)
        now = datetime.now(UTC)
        previous = session.get(Ticket, str(data.request_id))
        if previous:
            if (
                previous.consent_at is None
                or not journeys.is_rider(previous, principal)
                or previous.journey_id != j.id
                or (previous.board, previous.alight) != (data.board, data.alight)
            ):
                raise HTTPException(409, "Request ID conflict")
            return request_receipt(previous)
        if j.booking_mode != "approval" or j.cancelled or journeys.is_driver(j, principal):
            raise HTTPException(409, "Driver-approved booking unavailable")
        check_booking_eligibility(session, j)
        rows = journeys.tickets(session, j)
        q = journeys.quote(j, rows, data, now)
        for t in rows:
            if (
                journeys.is_rider(t, principal)
                and t.board < data.alight
                and data.board < t.alight
                and journeys.status(t, now) in ("requested", "held", "paid")
            ):
                if (t.board, t.alight) == (data.board, data.alight):
                    return request_receipt(t)
                raise HTTPException(409, "An overlapping request already exists")
        if not q["seats_available"]:
            raise HTTPException(409, "Seat unavailable")
        t = Ticket(
            id=str(data.request_id),
            journey_id=j.id,
            issuer=principal.issuer,
            rider=principal.subject,
            board=data.board,
            alight=data.alight,
            state="requested",
            expires=q["pickup_at"],
            fare=q["fare_paise"],
            travel_state="awaiting_boarding",
            requested_at=now,
            consent_at=now,
            consent_version=data.consent_version,
            consent_fare_paise=q["fare_paise"],
            consent_pickup_at=q["pickup_at"],
        )
        session.add(t)
        try:
            session.flush()
        except IntegrityError as exc:
            raise HTTPException(409, "Request ID conflict") from exc
        return request_receipt(t)


@router.get("/{jid}/requests")
def list_requests(jid: UUID, principal: RideReader, session: DatabaseSession):
    j = session.get(Journey, str(jid))
    if j is None or not journeys.is_driver(j, principal):
        raise HTTPException(404, "Journey not found")
    return [
        request_receipt(t)
        for t in journeys.tickets(session, j)
        if journeys.status(t, datetime.now(UTC)) == "requested"
    ]


def decision(session, jid, tid, principal, approved):
    with session.begin():
        j = journeys.locked(session, jid)
        if not journeys.is_driver(j, principal):
            raise HTTPException(404, "Journey not found")
        t = session.get(Ticket, tid)
        if not t or t.journey_id != j.id or t.consent_at is None:
            raise HTTPException(404, "Request not found")
        now = datetime.now(UTC)
        if (approved and t.consent_at and t.state in ("held", "paid", "exited")) or (
            not approved and t.state == "driver_cancelled"
        ):
            return journeys.receipt(t, now)
        if j.booking_mode != "approval" or journeys.status(t, now) != "requested" or j.cancelled:
            raise HTTPException(409, "Request is no longer pending")
        if approved:
            check_booking_eligibility(session, j)
            q = journeys.quote(
                j, journeys.tickets(session, j), Segment(board=t.board, alight=t.alight), now
            )
            if (
                not q["seats_available"]
                or q["fare_paise"] != t.consent_fare_paise
                or q["pickup_at"] != journeys.utc(t.consent_pickup_at)
            ):
                raise HTTPException(409, "Seats or consent terms changed")
            t.state = "held"
            t.expires = min(now + timedelta(minutes=15), q["pickup_at"])
        else:
            t.state = "driver_cancelled"
        return journeys.receipt(t, now)


@router.post("/{jid}/tickets/{tid}/approve")
def approve(jid: UUID, tid: UUID, principal: RideWriter, session: DatabaseSession):
    return decision(session, str(jid), str(tid), principal, True)


@router.post("/{jid}/tickets/{tid}/decline")
def decline(jid: UUID, tid: UUID, principal: RideWriter, session: DatabaseSession):
    return decision(session, str(jid), str(tid), principal, False)
