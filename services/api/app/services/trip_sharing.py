import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.models import Journey, Ticket, TripShare
from app.services import journeys


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def eligible(session, journey, ticket_id, principal=None):
    if not journey:
        raise HTTPException(410, "This trip-sharing link has ended.")
    if ticket_id:
        ticket = session.get(Ticket, ticket_id)
        if (
            not ticket
            or ticket.journey_id != journey.id
            or (principal and not journeys.is_rider(ticket, principal))
        ):
            raise HTTPException(404, "Reservation not found")
        if ticket.state != "paid" or journey.cancelled:
            raise HTTPException(410, "This trip-sharing link has ended.")
        return ticket.board, ticket.alight
    if principal and not journeys.is_driver(journey, principal):
        raise HTTPException(404, "Journey not found")
    if journey.cancelled:
        raise HTTPException(410, "This trip-sharing link has ended.")
    return 0, len(journey.stops) - 1


def expired(share, now):
    return (
        share.revoked
        or journeys.utc(share.expires_at) <= now
        or journeys.utc(share.updated_at or share.created_at) + timedelta(minutes=5) <= now
    )


def start(session, principal, data):
    with session.begin():
        j = journeys.locked(session, str(data.journey_id))
        tid = str(data.ticket_id) if data.ticket_id else None
        a, b = eligible(session, j, tid, principal)
        now = datetime.now(UTC)
        end = journeys.pickup(j, b) + timedelta(hours=1)
        if not journeys.pickup(j, a) - timedelta(hours=1) <= now < end:
            raise HTTPException(
                409, "Sharing opens one hour before pickup and closes one hour after drop-off."
            )
        # Restarting never leaves an older tracking link running.
        session.execute(
            update(TripShare)
            .where(
                TripShare.issuer == principal.issuer,
                TripShare.subject == principal.subject,
                TripShare.journey_id == j.id,
            )
            .values(revoked=True, latitude=None, longitude=None, accuracy_m=None)
        )
        token = secrets.token_urlsafe(32)
        share = TripShare(
            issuer=principal.issuer,
            subject=principal.subject,
            journey_id=j.id,
            ticket_id=tid,
            token_hash=digest(token),
            created_at=now,
            expires_at=min(now + timedelta(hours=4), end),
            passengers_allowed=data.passengers_allowed,
        )
        session.add(share)
        session.flush()
        return {"id": share.id, "token": token, "expires_at": share.expires_at}


def owned(session, sid, principal):
    share = session.get(TripShare, sid)
    if not share or (share.issuer, share.subject) != (principal.issuer, principal.subject):
        raise HTTPException(404, "Location sharing not found")
    journey = journeys.locked(session, share.journey_id)
    session.refresh(share)
    return share, journey


def locate(session, sid, principal, data):
    with session.begin():
        share, journey = owned(session, sid, principal)
        eligible(session, journey, share.ticket_id, principal)
        now = datetime.now(UTC)
        if expired(share, now):
            raise HTTPException(410, "Sharing ended. Start again for a new link.")
        if not now - timedelta(minutes=2) <= data.observed_at <= now + timedelta(seconds=30):
            raise HTTPException(
                422, "Location is old or the device clock is incorrect. Request a fresh fix."
            )
        if data.sequence <= share.sequence or (
            share.observed_at and data.observed_at <= journeys.utc(share.observed_at)
        ):
            return {"accepted": False}
        share.latitude, share.longitude, share.accuracy_m = (
            data.latitude,
            data.longitude,
            data.accuracy_m,
        )
        share.sequence, share.observed_at, share.updated_at = data.sequence, data.observed_at, now
        return {"accepted": True, "updated_at": now}


def stop(session, sid, principal):
    with session.begin():
        share, _ = owned(session, sid, principal)
        share.revoked = True
        share.latitude = share.longitude = share.accuracy_m = None
    return {"stopped": True}


def view(session, token):
    share = session.scalar(select(TripShare).where(TripShare.token_hash == digest(token)))
    now = datetime.now(UTC)
    if not share or expired(share, now):
        raise HTTPException(410, "This trip-sharing link has ended.")
    journey = session.get(Journey, share.journey_id)
    a, b = eligible(session, journey, share.ticket_id)
    return snapshot(share, journey, a, b, now)


def driver_view(session, jid, tid, principal):
    # The journey lock orders access against cancellation/exit and sharing revocation.
    with session.begin():
        journey = journeys.locked(session, jid)
        a, b = eligible(session, journey, tid, principal)
        now = datetime.now(UTC)
        if (
            not journeys.pickup(journey, a) - timedelta(hours=1)
            <= now
            < journeys.pickup(journey, b) + timedelta(hours=1)
        ):
            raise HTTPException(409, "Live tracking is available near your booked travel time.")
        share = session.scalar(
            select(TripShare)
            .where(
                TripShare.journey_id == jid,
                TripShare.ticket_id.is_(None),
                TripShare.passengers_allowed.is_(True),
                TripShare.revoked.is_(False),
            )
            .order_by(TripShare.created_at.desc())
            .limit(1)
        )
        if not share or expired(share, now):
            return {"state": "off", "position": None}
        return snapshot(share, journey, a, b, now)


def snapshot(share, journey, a, b, now):
    # A delayed but accepted observation must not look newer than the GPS fix.
    age = (
        (now - min(journeys.utc(share.updated_at), journeys.utc(share.observed_at))).total_seconds()
        if share.updated_at
        else None
    )
    return {
        "source": "passenger" if share.ticket_id else "driver",
        "vehicle": None
        if share.ticket_id
        else {key: (journey.vehicle or {}).get(key) for key in ("make", "model", "color")},
        "stops": [
            {key: stop.get(key) for key in ("name", "lat", "lon")}
            for stop in journey.stops[a : b + 1]
        ],
        "server_time": now,
        "origin": journey.stops[a]["name"],
        "destination": journey.stops[b]["name"],
        "expires_at": share.expires_at,
        "updated_at": share.updated_at,
        "state": "waiting" if age is None else "stale" if age > 60 else "live",
        "position": None
        if age is None
        else {
            "latitude": share.latitude,
            "longitude": share.longitude,
            "accuracy_m": share.accuracy_m,
            "observed_at": share.observed_at,
        },
    }


def purge_locations(engine):
    """Keep no location history; clear the latest fix once access ends."""
    now = datetime.now(UTC)
    with Session(engine) as session, session.begin():
        session.execute(
            update(TripShare)
            .where(
                or_(
                    TripShare.revoked.is_(True),
                    TripShare.expires_at <= now,
                    func.coalesce(TripShare.updated_at, TripShare.created_at)
                    <= now - timedelta(minutes=5),
                )
            )
            .values(
                revoked=True,
                latitude=None,
                longitude=None,
                accuracy_m=None,
                observed_at=None,
                updated_at=None,
            )
        )
