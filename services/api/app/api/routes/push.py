import os
from uuid import UUID

from fastapi import APIRouter, Response
from pydantic import BaseModel, ConfigDict, Field

from app.api.routes.bookings import DatabaseSession
from app.auth.dependencies import RideReader, RideWriter
from app.services import message_push

router = APIRouter(prefix="/v1/me/push", tags=["message notifications"])


class Keys(BaseModel):
    model_config = ConfigDict(extra="forbid")
    p256dh: str = Field(min_length=80, max_length=100, pattern=r"^[A-Za-z0-9_\-=]+$")
    auth: str = Field(min_length=20, max_length=32, pattern=r"^[A-Za-z0-9_\-=]+$")


class Endpoint(BaseModel):
    model_config = ConfigDict(extra="forbid")
    endpoint: str = Field(min_length=10, max_length=2048)


class Subscribe(Endpoint):
    keys: Keys
    binding: UUID


@router.get("")
def configuration(principal: RideReader, response: Response):
    response.headers["Cache-Control"] = "no-store"
    enabled = message_push.configured()
    return {
        "available": enabled,
        "public_key": os.getenv("VAPID_PUBLIC_KEY", "") if enabled else "",
    }


@router.put("")
def subscribe(data: Subscribe, principal: RideWriter, session: DatabaseSession):
    return message_push.subscribe(session, principal, data)


@router.delete("")
def unsubscribe(data: Endpoint, principal: RideWriter, session: DatabaseSession):
    return message_push.unsubscribe(session, principal, data.endpoint)
