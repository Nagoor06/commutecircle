"""Project pre-Journey offers and requests into the signed-in trip workspace."""

from collections import defaultdict
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Query
from sqlalchemy import and_, select
from sqlalchemy.orm import aliased

from app.api.routes.bookings import DatabaseSession
from app.auth.dependencies import RideReader
from app.models import Booking, PickupPoint, Ride
from app.services.journeys import utc

router = APIRouter(prefix="/v1/me", tags=["trip history"])


@router.get("/earlier-trips")
def earlier_trips(
    principal: RideReader,
    session: DatabaseSession,
    role: Literal["driver", "passenger"],
    history: bool = False,
    offset: int = Query(0, ge=0),
):
    origin, destination = aliased(PickupPoint), aliased(PickupPoint)
    query = (
        select(Ride, origin.name, destination.name)
        .join(origin, origin.id == Ride.origin_id)
        .join(destination, destination.id == Ride.destination_id)
    )
    active = and_(Ride.cancelled.is_(False), Ride.departure_at > datetime.now(UTC))
    rider = and_(
        Booking.rider_issuer == principal.issuer, Booking.rider_subject == principal.subject
    )
    if role == "driver":
        query = query.where(
            Ride.driver_issuer == principal.issuer, Ride.driver_subject == principal.subject
        )
    else:
        query = query.join(Booking, Booking.ride_id == Ride.id).where(rider)
        active = and_(active, Booking.status.in_(("pending", "accepted")))
    rows = session.execute(
        query.where(~active if history else active)
        .order_by(Ride.departure_at.desc() if history else Ride.departure_at, Ride.id)
        .limit(50)
        .offset(offset)
    ).all()
    requests = defaultdict(list)
    if rows:
        bookings = select(Booking).where(Booking.ride_id.in_([r.id for r, _, _ in rows]))
        if role == "passenger":
            bookings = bookings.where(rider)
        for booking in session.scalars(bookings.order_by(Booking.created_at, Booking.id)):
            requests[booking.ride_id].append({"id": booking.id, "status": booking.status})
    return [
        {
            "id": ride.id,
            "origin": start,
            "destination": end,
            "departure_at": utc(ride.departure_at),
            "cancelled": ride.cancelled,
            "requests": requests[ride.id],
        }
        for ride, start, end in rows
    ]
