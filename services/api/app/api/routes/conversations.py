from typing import Annotated

from fastapi import APIRouter, Query, Response

from app.api.routes.bookings import DatabaseSession
from app.auth.dependencies import RideReader
from app.services.conversations import inbox
from app.services.conversations import summary as unread_summary

router = APIRouter(prefix="/v1/me/conversations", tags=["private booking chat"])


@router.get("/summary")
def summary(principal: RideReader, session: DatabaseSession, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return unread_summary(session, principal)


@router.get("")
def conversations(
    principal: RideReader,
    session: DatabaseSession,
    response: Response,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0, le=10000)] = 0,
    unread_only: bool = False,
):
    response.headers["Cache-Control"] = "no-store"
    return inbox(session, principal, limit, offset, unread_only)
