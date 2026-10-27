from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import AwareDatetime
from sqlalchemy.orm import Session

from app.auth.dependencies import RideReader, RideWriter
from app.db.session import get_session
from app.repositories.rides import list_owned_rides
from app.schemas.ride import RideCreate, RideOut
from app.services import rides as service

router = APIRouter(prefix="/v1/rides", tags=["rides"])
DatabaseSession = Annotated[Session, Depends(get_session)]


@router.post("", response_model=RideOut, status_code=201)
def create_ride(data: RideCreate, principal: RideWriter, session: DatabaseSession):
    try:
        return service.create_ride(session, principal, data)
    except service.RideValidationError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("", response_model=list[RideOut])
def search_rides(
    principal: RideReader,
    session: DatabaseSession,
    origin_id: Annotated[int, Query(gt=0)],
    destination_id: Annotated[int, Query(gt=0)],
    after: AwareDatetime | None = None,
    before: AwareDatetime | None = None,
    seats: Annotated[int, Query(ge=1, le=8)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    try:
        return service.search_rides(
            session,
            origin_id=origin_id,
            destination_id=destination_id,
            after=after,
            before=before,
            seats=seats,
            limit=limit,
            offset=offset,
        )
    except service.RideValidationError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/mine", response_model=list[RideOut])
def my_rides(
    principal: RideReader,
    session: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return list_owned_rides(
        session, issuer=principal.issuer, subject=principal.subject, limit=limit, offset=offset
    )
