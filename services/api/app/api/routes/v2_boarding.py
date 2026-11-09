"""Passenger-owned OTP, driver-validated boarding, rider-confirmed trip completion."""

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.api.routes.bookings import DatabaseSession
from app.auth.dependencies import RideWriter
from app.models.journey import Ticket
from app.models.v2 import BoardingChallenge, TripEvent
from app.services import journeys

router = APIRouter(prefix="/v1/journeys", tags=["V2 boarding"])


class Pin(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pin: str = Field(pattern="^[0-9]{6}$")


def event(session, j, t, principal, kind, now):
    session.add(TripEvent(journey_id=j.id, ticket_id=t.id, issuer=principal.issuer, subject=principal.subject, kind=kind, created_at=now))


@router.post("/{jid}/tickets/{tid}/boarding-challenge")
def create_pin(jid: UUID, tid: UUID, principal: RideWriter, session: DatabaseSession):
    with session.begin():
        j = journeys.locked(session, str(jid))
        t = session.get(Ticket, str(tid))
        now = datetime.now(UTC)
        if not t or t.journey_id != j.id or not journeys.is_rider(t, principal):
            raise HTTPException(404, "Ticket not found")
        if t.state != "paid" or t.travel_state in ("boarded", "completed") or j.cancelled:
            raise HTTPException(409, "Cannot start boarding")
        # Show PIN only shortly before pickup; don't create boarding credentials days early.
        if not -timedelta(minutes=30) <= now - journeys.pickup(j, t.board) <= timedelta(minutes=45):
            raise HTTPException(409, "Boarding window is closed")
        pin = f"{secrets.randbelow(1_000_000):06d}"
        salt = secrets.token_hex(16)
        digest = hashlib.sha256((salt + pin).encode()).hexdigest()
        challenge = session.get(BoardingChallenge, t.id)
        if challenge is None:
            challenge = BoardingChallenge(ticket_id=t.id, salt=salt, digest=digest, expires_at=now + timedelta(minutes=5), attempts=0)
            session.add(challenge)
        else:
            if challenge.attempts >= 5 and challenge.expires_at > now:
                raise HTTPException(429, "Boarding attempts temporarily locked")
            challenge.salt, challenge.digest = salt, digest
            challenge.expires_at, challenge.attempts, challenge.used_at = now + timedelta(minutes=5), 0, None
        return {"pin": pin, "expires_at": challenge.expires_at}


@router.post("/{jid}/tickets/{tid}/board")
def board(jid: UUID, tid: UUID, data: Pin, principal: RideWriter, session: DatabaseSession):
    # Invalid attempts must be committed before returning an error.
    error = None
    with session.begin():
        j = journeys.locked(session, str(jid))
        t = session.get(Ticket, str(tid))
        now = datetime.now(UTC)
        if not journeys.is_driver(j, principal) or not t or t.journey_id != j.id:
            raise HTTPException(404, "Ticket not found")
        challenge = session.get(BoardingChallenge, t.id)
        if t.state != "paid" or t.travel_state in ("boarded", "completed") or j.cancelled or not challenge or challenge.used_at or journeys.utc(challenge.expires_at) <= now:
            raise HTTPException(409, "Boarding challenge unavailable")
        if challenge.attempts >= 5:
            raise HTTPException(429, "Too many attempts")
        challenge.attempts += 1
        digest = hashlib.sha256((challenge.salt + data.pin).encode()).hexdigest()
        if not hmac.compare_digest(digest, challenge.digest):
            error = 429 if challenge.attempts >= 5 else 422
        else:
            challenge.used_at = now
            t.travel_state, t.boarded_at = "boarded", now
            event(session, j, t, principal, "boarded", now)
    if error:
        raise HTTPException(error, "Invalid boarding PIN")
    return {"travel_state": "boarded"}


@router.post("/{jid}/tickets/{tid}/complete")
def complete(jid: UUID, tid: UUID, principal: RideWriter, session: DatabaseSession):
    with session.begin():
        j = journeys.locked(session, str(jid))
        t = session.get(Ticket, str(tid))
        now = datetime.now(UTC)
        if not t or t.journey_id != j.id or not journeys.is_rider(t, principal):
            raise HTTPException(404, "Ticket not found")
        if t.travel_state == "completed":
            return {"travel_state": "completed"}
        if t.state not in ("paid", "exited") or t.travel_state != "boarded" or now < journeys.pickup(j, t.board):
            raise HTTPException(409, "Boarding required before completion")
        t.travel_state, t.completed_at = "completed", now
        event(session, j, t, principal, "completed", now)
    return {"travel_state": "completed"}
