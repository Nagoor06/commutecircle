from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PickupPoint


def list_pickup_points(session: Session, *, city: str, limit: int, offset: int):
    query = (
        select(PickupPoint)
        .where(PickupPoint.city == city)
        .order_by(PickupPoint.id)
        .limit(limit)
        .offset(offset)
    )
    return list(session.scalars(query))
