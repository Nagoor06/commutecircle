from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select

from app.api.routes.bookings import DatabaseSession
from app.auth.dependencies import RideReader, RideWriter, bearer
from app.models.journey import Ticket
from app.models.notification import Notification, NotificationPreference
from app.schemas.notification import CheckPhone, NotificationSettings, VerifyPhone
from app.services import notification_preferences as preferences
from app.services.journeys import is_rider

router = APIRouter(tags=["private booking alerts"])


@router.get("/v1/me/notifications")
def settings(principal: RideReader, session: DatabaseSession):
    key = preferences.owner_key(principal.issuer, principal.subject)
    return preferences.view(session.get(NotificationPreference, key))


@router.put("/v1/me/notifications")
def save(data: NotificationSettings, principal: RideWriter, session: DatabaseSession):
    return preferences.update(
        session, preferences.owner_key(principal.issuer, principal.subject), data
    )


@router.post("/v1/me/notifications/email")
def connect_email(
    request: Request,
    principal: RideWriter,
    session: DatabaseSession,
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer)],
):
    # Fixed operator-configured issuer, never a user-supplied URL or decoded token jku.
    issuer = request.app.state.token_verifier.settings.oidc_issuer
    return preferences.connect_email(
        session,
        preferences.owner_key(principal.issuer, principal.subject),
        issuer,
        principal.subject,
        credentials.credentials,
    )


@router.post("/v1/me/notifications/phone/code", status_code=202)
def phone_code(data: VerifyPhone, principal: RideWriter, session: DatabaseSession):
    return preferences.start_phone(
        session, preferences.owner_key(principal.issuer, principal.subject), data.phone
    )


@router.post("/v1/me/notifications/phone/verify")
def phone_verify(data: CheckPhone, principal: RideWriter, session: DatabaseSession):
    return preferences.check_phone(
        session, preferences.owner_key(principal.issuer, principal.subject), data.code
    )


@router.get("/v1/journeys/{jid}/tickets/{tid}/notifications")
def history(jid: UUID, tid: UUID, principal: RideReader, session: DatabaseSession):
    ticket = session.get(Ticket, str(tid))
    if not ticket or ticket.journey_id != str(jid) or not is_rider(ticket, principal):
        raise HTTPException(404, "Reservation not found")
    return [
        {"event": row.event, "channel": row.channel, "state": row.state, "created": row.created}
        for row in session.scalars(
            select(Notification)
            .where(Notification.ticket_id == ticket.id)
            .order_by(Notification.created, Notification.id)
        )
    ]
