from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import RideReader, RideWriter
from app.db.session import get_session
from app.repositories.bookings import my_bookings
from app.schemas.booking import BookingOut
from app.services import bookings as service

router = APIRouter(prefix="/v1", tags=["bookings"])
DatabaseSession = Annotated[Session, Depends(get_session)]
Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]


def run_action(function, *args):
    try:
        return function(*args)
    except service.BookingError as exc:
        raise HTTPException(exc.status, str(exc)) from exc


@router.post("/rides/{ride_id}/requests", response_model=BookingOut)
def request_seat(ride_id: UUID, principal: RideWriter, session: DatabaseSession):
    return run_action(service.request_seat, session, principal, str(ride_id))


@router.get("/rides/{ride_id}/requests", response_model=list[BookingOut])
def driver_requests(
    ride_id: UUID,
    principal: RideReader,
    session: DatabaseSession,
    limit: Limit = 20,
    offset: Offset = 0,
):
    return run_action(service.driver_requests, session, principal, str(ride_id), limit, offset)


@router.get("/bookings/mine", response_model=list[BookingOut])
def list_mine(
    principal: RideReader, session: DatabaseSession, limit: Limit = 20, offset: Offset = 0
):
    return my_bookings(session, principal, limit, offset)


@router.post("/bookings/{booking_id}/accept", response_model=BookingOut)
def accept(booking_id: UUID, principal: RideWriter, session: DatabaseSession):
    return run_action(service.transition, session, principal, str(booking_id), "accepted")


@router.post("/bookings/{booking_id}/reject", response_model=BookingOut)
def reject(booking_id: UUID, principal: RideWriter, session: DatabaseSession):
    return run_action(service.transition, session, principal, str(booking_id), "rejected")


@router.post("/bookings/{booking_id}/cancel", response_model=BookingOut)
def cancel(booking_id: UUID, principal: RideWriter, session: DatabaseSession):
    return run_action(service.transition, session, principal, str(booking_id), "cancelled")
