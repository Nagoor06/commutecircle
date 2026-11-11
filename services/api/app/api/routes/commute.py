from fastapi import APIRouter, Response
from sqlalchemy import delete

from app.api.routes.bookings import DatabaseSession
from app.auth.dependencies import RideReader, RideWriter
from app.db.session import insert_for
from app.models.commute import Commute
from app.schemas.commute import CommutePreferences

router = APIRouter(prefix="/v1/me/commute", tags=["private commute"])


@router.get("")
def read(principal: RideReader, session: DatabaseSession, response: Response):
    response.headers["Cache-Control"] = "no-store"
    row = session.get(Commute, (principal.issuer, principal.subject))
    return (
        {"pickup": row.pickup, "workplace": row.workplace, "employer": row.employer}
        if row
        else None
    )


@router.put("")
def save(data: CommutePreferences, principal: RideWriter, session: DatabaseSession):
    values = dict(
        issuer=principal.issuer,
        subject=principal.subject,
        pickup=data.pickup.model_dump(exclude_none=True),
        workplace=data.workplace.model_dump(exclude_none=True),
        employer=data.employer,
    )
    with session.begin():
        stmt = insert_for(session, Commute).values(**values)
        session.execute(
            stmt.on_conflict_do_update(
                index_elements=[Commute.issuer, Commute.subject],
                set_={
                    key: getattr(stmt.excluded, key) for key in ("pickup", "workplace", "employer")
                },
            )
        )
    return {"saved": True}


@router.delete("")
def forget(principal: RideWriter, session: DatabaseSession):
    with session.begin():
        session.execute(
            delete(Commute).where(
                Commute.issuer == principal.issuer, Commute.subject == principal.subject
            )
        )
    return {"deleted": True}
