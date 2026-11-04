from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import IntegrityError

from app.api.routes.bookings import DatabaseSession
from app.auth.dependencies import RideReader, RideWriter
from app.services import chat

router = APIRouter(
    prefix="/v1/journeys/{jid}/tickets/{tid}/messages", tags=["private booking chat"]
)


class SendMessage(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    message_id: UUID
    text: str = Field(min_length=1, max_length=500)


@router.get("")
def messages(jid: UUID, tid: UUID, principal: RideReader, session: DatabaseSession):
    return chat.read(session, str(jid), str(tid), principal)


@router.post("")
def send(jid: UUID, tid: UUID, data: SendMessage, principal: RideWriter, session: DatabaseSession):
    try:
        return chat.send(session, str(jid), str(tid), principal, data)
    except IntegrityError as exc:
        raise HTTPException(409, "Message ID conflict. Retry with a new message.") from exc


@router.post("/block")
def block(jid: UUID, tid: UUID, principal: RideWriter, session: DatabaseSession):
    return chat.block(session, str(jid), str(tid), principal)
