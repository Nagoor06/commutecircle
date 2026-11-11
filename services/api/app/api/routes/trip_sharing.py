from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path
from sqlalchemy import delete, select

from app.api.routes.bookings import DatabaseSession
from app.auth.dependencies import RideReader, RideWriter
from app.db.session import insert_for
from app.models import TrustedContact
from app.schemas.trip_share import ContactInput, LocationUpdate, ShareStart, ShareToken
from app.services import trip_sharing

router = APIRouter(prefix="/v1", tags=["trusted trip sharing"])
Slot = Annotated[int, Path(ge=1, le=5)]


@router.get("/me/trusted-contacts")
def contacts(principal: RideReader, session: DatabaseSession):
    rows = session.scalars(
        select(TrustedContact)
        .where(
            TrustedContact.issuer == principal.issuer, TrustedContact.subject == principal.subject
        )
        .order_by(TrustedContact.slot)
    )
    return [
        dict(slot=c.slot, name=c.name, channel=c.channel, destination=c.destination) for c in rows
    ]


@router.put("/me/trusted-contacts/{slot}")
def save_contact(slot: Slot, data: ContactInput, principal: RideWriter, session: DatabaseSession):
    with session.begin():
        stmt = insert_for(session, TrustedContact).values(
            issuer=principal.issuer, subject=principal.subject, slot=slot, **data.model_dump()
        )
        session.execute(
            stmt.on_conflict_do_update(
                index_elements=[TrustedContact.issuer, TrustedContact.subject, TrustedContact.slot],
                set_={
                    key: getattr(stmt.excluded, key) for key in ("name", "channel", "destination")
                },
            )
        )
    return {"saved": True}


@router.delete("/me/trusted-contacts/{slot}")
def delete_contact(slot: Slot, principal: RideWriter, session: DatabaseSession):
    with session.begin():
        session.execute(
            delete(TrustedContact).where(
                TrustedContact.issuer == principal.issuer,
                TrustedContact.subject == principal.subject,
                TrustedContact.slot == slot,
            )
        )
    return {"deleted": True}


@router.post("/trip-shares", status_code=201)
def start(data: ShareStart, principal: RideWriter, session: DatabaseSession):
    return trip_sharing.start(session, principal, data)


@router.post("/trip-shares/view")
def view(data: ShareToken, session: DatabaseSession):
    # Token in the request body, never in a request path or query string.
    return trip_sharing.view(session, data.token)


@router.get("/journeys/{jid}/tickets/{tid}/driver-location")
def driver_location(jid: UUID, tid: UUID, principal: RideReader, session: DatabaseSession):
    return trip_sharing.driver_view(session, str(jid), str(tid), principal)


@router.put("/trip-shares/{sid}/location")
def locate(sid: UUID, data: LocationUpdate, principal: RideWriter, session: DatabaseSession):
    return trip_sharing.locate(session, str(sid), principal, data)


@router.post("/trip-shares/{sid}/stop")
def stop(sid: UUID, principal: RideWriter, session: DatabaseSession):
    return trip_sharing.stop(session, str(sid), principal)
