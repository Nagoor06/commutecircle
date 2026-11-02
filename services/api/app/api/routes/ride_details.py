from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from app.api.routes.bookings import DatabaseSession
from app.auth.dependencies import RideReader, RideWriter
from app.models import Booking, Ride
from app.schemas.ride_details import Review, RideDetails
from app.services.bookings import is_rider

router = APIRouter(prefix="/v1", tags=["ride details"])


@router.get("/rides/{ride_id}/details", response_model=RideDetails)
def details(ride_id: UUID, principal: RideReader, session: DatabaseSession):
    ride = session.get(Ride, str(ride_id))
    if ride is None:
        raise HTTPException(404, "Ride not found")
    average, count = session.execute(
        select(func.avg(Booking.stars), func.count(Booking.stars))
        .join(Ride, Booking.ride_id == Ride.id)
        .where(Ride.driver_issuer == ride.driver_issuer, Ride.driver_subject == ride.driver_subject)
    ).one()
    return {
        "cancelled": ride.cancelled,
        "vehicle": ride.vehicle,
        "driver_rating": {"average": round(float(average), 1) if count else None, "count": count},
    }


@router.put("/bookings/{booking_id}/rating", response_model=Review)
def rate_driver(booking_id: UUID, data: Review, principal: RideWriter, session: DatabaseSession):
    with session.begin():
        booking = session.scalar(
            select(Booking).where(Booking.id == str(booking_id)).with_for_update()
        )
        if booking is None or not is_rider(booking, principal):
            raise HTTPException(404, "Booking not found")
        ride = session.get(Ride, booking.ride_id)
        departure = ride.departure_at
        if departure.tzinfo is None:
            departure = departure.replace(tzinfo=UTC)
        if booking.status != "accepted" or departure >= datetime.now(UTC):
            raise HTTPException(409, "An accepted booking after departure is required")
        booking.stars = data.stars
    return data
