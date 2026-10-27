from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.principal import Principal
from app.models import PickupPoint, Ride
from app.repositories import rides as repository
from app.schemas.ride import RideCreate


class RideValidationError(Exception):
    pass


def create_ride(session: Session, principal: Principal, data: RideCreate) -> Ride:
    departure = data.departure_at.astimezone(UTC)
    if departure <= datetime.now(UTC):
        raise RideValidationError("Departure must be in the future")
    # Service owns the transaction; repositories do not commit independently.
    with session.begin():
        points = set(
            session.scalars(
                select(PickupPoint.id).where(
                    PickupPoint.id.in_([data.origin_id, data.destination_id])
                )
            )
        )
        if points != {data.origin_id, data.destination_id}:
            raise RideValidationError("Choose existing public pickup points")
        ride = Ride(
            driver_issuer=principal.issuer,
            driver_subject=principal.subject,
            origin_id=data.origin_id,
            destination_id=data.destination_id,
            departure_at=departure,
            seats_available=data.seats_available,
            seats_capacity=data.seats_available,
        )
        repository.add_ride(session, ride)
    session.refresh(ride)
    return ride


def search_rides(
    session: Session,
    *,
    origin_id: int,
    destination_id: int,
    after: datetime | None,
    before: datetime | None,
    seats: int,
    limit: int,
    offset: int,
):
    now = datetime.now(UTC)
    after = max(after.astimezone(UTC), now) if after else now
    before = before.astimezone(UTC) if before else after + timedelta(days=1)
    if origin_id == destination_id:
        raise RideValidationError("Origin and destination must differ")
    if before <= after or before - after > timedelta(days=7):
        raise RideValidationError("Search window must be positive and no longer than seven days")
    return repository.search_rides(
        session,
        origin_id=origin_id,
        destination_id=destination_id,
        after=after,
        before=before,
        seats=seats,
        limit=limit,
        offset=offset,
    )
