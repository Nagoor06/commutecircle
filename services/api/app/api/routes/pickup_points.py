from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_session
from app.repositories.pickup_points import list_pickup_points
from app.schemas.pickup_point import PickupPointOut

router = APIRouter(prefix="/v1", tags=["pickup-points"])


@router.get("/pickup-points", response_model=list[PickupPointOut])
def pickup_points(
    session: Annotated[Session, Depends(get_session)],
    city: Annotated[str, Query(min_length=1, max_length=80, pattern=r"\S")],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    rows = list_pickup_points(session, city=city.strip(), limit=limit, offset=offset)
    return [PickupPointOut.model_validate(row) for row in rows]
