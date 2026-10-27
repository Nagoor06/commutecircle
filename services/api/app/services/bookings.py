from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.auth.principal import Principal
from app.models import Booking, Ride
from app.repositories import bookings as repo
from app.schemas.booking import BookingOut


class BookingError(Exception):
    def __init__(self, status: int, message: str):
        self.status = status
        super().__init__(message)


def is_driver(ride, principal: Principal) -> bool:
    return (ride.driver_issuer, ride.driver_subject) == (principal.issuer, principal.subject)


def is_rider(booking, principal: Principal) -> bool:
    return (booking.rider_issuer, booking.rider_subject) == (principal.issuer, principal.subject)


def require_upcoming(ride) -> None:
    departure = ride.departure_at
    if departure.tzinfo is None:
        departure = departure.replace(tzinfo=UTC)
    if departure <= datetime.now(UTC):
        raise BookingError(409, "Ride has already departed")


def request_seat(session: Session, principal: Principal, ride_id: str):
    with session.begin():
        ride = repo.lock_ride(session, ride_id)
        if ride is None:
            raise BookingError(404, "Ride not found")
        if is_driver(ride, principal):
            raise BookingError(409, "You cannot request your own ride")
        booking = repo.find_request(session, ride_id, principal)
        if booking is None:
            require_upcoming(ride)
            if ride.seats_available == 0:
                raise BookingError(409, "No seats available")
            booking = Booking(
                ride_id=ride_id,
                rider_issuer=principal.issuer,
                rider_subject=principal.subject,
                status="pending",
            )
            session.add(booking)
        # Repeated requests return the same resource, including terminal states.
        session.flush()
        result = BookingOut.model_validate(booking)
    return result


def transition(session: Session, principal: Principal, booking_id: str, target: str):
    with session.begin():
        ride_id = repo.ride_for_booking(session, booking_id)
        if ride_id is None:
            raise BookingError(404, "Booking not found")
        ride = repo.lock_ride(session, ride_id)
        booking = repo.get_booking(session, booking_id)
        driver = is_driver(ride, principal)
        rider = is_rider(booking, principal)
        if not driver and not rider:
            raise BookingError(404, "Booking not found")
        if target in ("accepted", "rejected") and not driver:
            raise BookingError(403, "Only the driver can decide requests")
        if target not in ("accepted", "rejected", "cancelled"):
            raise BookingError(409, "Unsupported transition")
        if booking.status != target:
            require_upcoming(ride)
            if target in ("accepted", "rejected") and booking.status != "pending":
                raise BookingError(409, "Only pending requests can be decided")
            if target == "cancelled" and booking.status not in ("pending", "accepted"):
                raise BookingError(409, "This booking cannot be cancelled")
            if target == "accepted" and not repo.allocate_seat(session, ride_id):
                raise BookingError(409, "No seats available")
            if target == "cancelled" and booking.status == "accepted":
                if not repo.restore_seat(session, ride_id):
                    raise BookingError(409, "Seat capacity conflict")
            booking.status = target
        session.flush()
        result = BookingOut.model_validate(booking)
    return result


def driver_requests(session: Session, principal: Principal, ride_id: str, limit: int, offset: int):
    # No writes; no row lock needed. Ownership is immutable in this API.
    ride = session.get(Ride, ride_id)
    if ride is None or not is_driver(ride, principal):
        raise BookingError(404, "Ride not found")
    return repo.ride_bookings(session, ride_id, limit, offset)
