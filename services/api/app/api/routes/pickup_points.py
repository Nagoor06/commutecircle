from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_session
from app.repositories.pickup_points import list_pickup_points
from app.schemas.location import NearbyPoint, NearbyQuery
from app.schemas.pickup_point import PickupPointOut
from app.services.locations import nearby_points

router = APIRouter(prefix="/v1", tags=["pickup-points"])


@router.get("/pickup-points", response_model=list[PickupPointOut])
def pickup_points(
    session: Annotated[Session, Depends(get_session)],
    city: Annotated[str, Query(min_length=1, max_length=80, pattern=r"\S")],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    q: Annotated[str, Query(max_length=120)] = "",
):
    rows = list_pickup_points(session, city=city.strip(), limit=limit, offset=offset, q=q)
    return [PickupPointOut.model_validate(row) for row in rows]


@router.post("/pickup-points/nearby", response_model=list[NearbyPoint])
def nearby(data: NearbyQuery, session: Annotated[Session, Depends(get_session)]):
    return nearby_points(session, data)
