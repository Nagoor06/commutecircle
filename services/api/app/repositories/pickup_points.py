from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import PickupPoint


def list_pickup_points(session: Session, *, city: str, limit: int, offset: int, q: str = ""):
    query = (
        select(PickupPoint)
        .where(PickupPoint.city == city)
        .order_by(PickupPoint.id)
        .limit(limit)
        .offset(offset)
    )
    if q.strip():
        query = query.where(
            func.lower(PickupPoint.name).contains(q.strip().lower(), autoescape=True)
        )
    return list(session.scalars(query))
