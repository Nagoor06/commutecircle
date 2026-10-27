from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Ride


def add_ride(session: Session, ride: Ride) -> None:
    session.add(ride)


def search_rides(
    session: Session,
    *,
    origin_id: int,
    destination_id: int,
    after: datetime,
    before: datetime,
    seats: int,
    limit: int,
    offset: int,
):
    query = (
        select(Ride)
        .where(
            Ride.origin_id == origin_id,
            Ride.destination_id == destination_id,
            Ride.departure_at >= after,
            Ride.departure_at < before,
            Ride.seats_available >= seats,
        )
        .order_by(Ride.departure_at, Ride.id)
        .limit(limit)
        .offset(offset)
    )
    return list(session.scalars(query))


def list_owned_rides(session: Session, *, issuer: str, subject: str, limit: int, offset: int):
    query = (
        select(Ride)
        .where(Ride.driver_issuer == issuer, Ride.driver_subject == subject)
        .order_by(Ride.departure_at, Ride.id)
        .limit(limit)
        .offset(offset)
    )
    return list(session.scalars(query))
