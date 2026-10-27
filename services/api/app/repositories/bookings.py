from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.auth.principal import Principal
from app.models import Booking, Ride


def lock_ride(session: Session, ride_id: str):
    # Every mutation locks the parent ride first, providing one lock order.
    return session.scalar(select(Ride).where(Ride.id == ride_id).with_for_update())


def find_request(session: Session, ride_id: str, principal: Principal):
    return session.scalar(
        select(Booking).where(
            Booking.ride_id == ride_id,
            Booking.rider_issuer == principal.issuer,
            Booking.rider_subject == principal.subject,
        )
    )


def ride_for_booking(session: Session, booking_id: str):
    # Read only the foreign key, not a potentially stale booking ORM instance.
    return session.scalar(select(Booking.ride_id).where(Booking.id == booking_id))


def get_booking(session: Session, booking_id: str):
    return session.scalar(select(Booking).where(Booking.id == booking_id).with_for_update())


def allocate_seat(session: Session, ride_id: str) -> bool:
    result = session.execute(
        update(Ride)
        .where(Ride.id == ride_id, Ride.seats_available >= 1)
        .values(seats_available=Ride.seats_available - 1)
    )
    return result.rowcount == 1


def restore_seat(session: Session, ride_id: str) -> bool:
    result = session.execute(
        update(Ride)
        .where(Ride.id == ride_id, Ride.seats_available < Ride.seats_capacity)
        .values(seats_available=Ride.seats_available + 1)
    )
    return result.rowcount == 1


def my_bookings(session: Session, principal: Principal, limit: int, offset: int):
    return list(
        session.scalars(
            select(Booking)
            .where(
                Booking.rider_issuer == principal.issuer, Booking.rider_subject == principal.subject
            )
            .order_by(Booking.created_at, Booking.id)
            .limit(limit)
            .offset(offset)
        )
    )


def ride_bookings(session: Session, ride_id: str, limit: int, offset: int):
    return list(
        session.scalars(
            select(Booking)
            .where(Booking.ride_id == ride_id)
            .order_by(Booking.created_at, Booking.id)
            .limit(limit)
            .offset(offset)
        )
    )
