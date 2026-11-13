"""Invitation-only commute circles. Joining never implies access to live GPS."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select

from app.api.routes.bookings import DatabaseSession
from app.auth.dependencies import RideReader, RideWriter
from app.models.journey import Journey
from app.models.v2 import CircleInvitation, CircleMember, CommuteCircle
from app.services import journey_catalog, journeys
from app.services.v2_common import bookable_journeys

router = APIRouter(prefix="/v1", tags=["V2 circles"])
INVITATION_LIFETIME = timedelta(days=2)


class CircleInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=3, max_length=80)


class InviteToken(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=32, max_length=256)


def membership(session, cid, p):
    return session.get(CircleMember, (cid, p.issuer, p.subject))


def display_circle(row, role):
    return {"id": row.id, "name": row.name, "role": role, "created_at": row.created_at}


def owned_circle(session, cid, principal, *, lock=False):
    circle = session.get(CommuteCircle, str(cid), with_for_update=lock)
    if not circle or (circle.issuer, circle.owner) != (principal.issuer, principal.subject):
        raise HTTPException(404, "Circle not found")
    return circle


def active_invitations(cid):
    return select(CircleInvitation).where(
        CircleInvitation.circle_id == str(cid),
        CircleInvitation.accepted_at.is_(None),
        CircleInvitation.revoked_at.is_(None),
        CircleInvitation.expires_at > datetime.now(UTC),
    )


@router.post("/circles", status_code=201)
def create_circle(data: CircleInput, principal: RideWriter, session: DatabaseSession):
    with session.begin():
        circle = CommuteCircle(
            name=data.name,
            issuer=principal.issuer,
            owner=principal.subject,
            created_at=datetime.now(UTC),
        )
        session.add(circle)
        session.flush()
        session.add(
            CircleMember(
                circle_id=circle.id,
                issuer=principal.issuer,
                subject=principal.subject,
                role="owner",
                joined_at=datetime.now(UTC),
            )
        )
        result = display_circle(circle, "owner")
    return result


@router.get("/circles")
def my_circles(principal: RideReader, session: DatabaseSession, response: Response):
    response.headers["Cache-Control"] = "no-store"
    rows = session.execute(
        select(CommuteCircle, CircleMember.role)
        .join(CircleMember, CircleMember.circle_id == CommuteCircle.id)
        .where(CircleMember.issuer == principal.issuer, CircleMember.subject == principal.subject)
        .order_by(CommuteCircle.created_at.desc())
        .limit(50)
    )
    return [display_circle(circle, role) for circle, role in rows]


@router.get("/circles/{cid}")
def circle_details(cid: UUID, principal: RideReader, session: DatabaseSession, response: Response):
    response.headers["Cache-Control"] = "no-store"
    circle = session.get(CommuteCircle, str(cid))
    if not circle or not membership(session, circle.id, principal):
        raise HTTPException(404, "Circle not found")
    count = session.scalar(
        select(func.count()).select_from(CircleMember).where(CircleMember.circle_id == circle.id)
    )
    return {
        **display_circle(circle, membership(session, circle.id, principal).role),
        "members": count,
    }


@router.get("/circles/{cid}/journeys")
def browse_circle(cid: UUID, principal: RideReader, session: DatabaseSession, response: Response):
    response.headers["Cache-Control"] = "no-store"
    if not membership(session, str(cid), principal):
        raise HTTPException(404, "Circle not found")
    rows = list(
        session.scalars(
            select(Journey)
            .where(
                Journey.circle_id == str(cid),
                Journey.cancelled.is_(False),
                Journey.last_stop_at > datetime.now(UTC),
                bookable_journeys(),
            )
            .order_by(Journey.departure, Journey.id)
            .limit(50)
        )
    )
    return [
        {"journey": view, "board": 0, "alight": len(view["stops"]) - 1, "match": {}}
        for view in journey_catalog.views(session, rows, principal)
    ]


@router.post("/circles/{cid}/invitations", status_code=201)
def invite(cid: UUID, principal: RideWriter, session: DatabaseSession):
    with session.begin():
        circle = owned_circle(session, cid, principal, lock=True)
        if session.scalar(active_invitations(cid).offset(9).limit(1)):
            raise HTTPException(429, "Too many active invitations")
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(UTC) + INVITATION_LIFETIME
        invitation = CircleInvitation(
            circle_id=circle.id,
            token_digest=hashlib.sha256(token.encode()).hexdigest(),
            expires_at=expires_at,
        )
        session.add(invitation)
        session.flush()
        invite_id = invitation.id
    return {
        "id": invite_id,
        "token": token,
        "expires_at": expires_at,
        "expires_in_seconds": int(INVITATION_LIFETIME.total_seconds()),
        "warning": "Anyone with this invitation can join until it is used or expires",
    }


@router.get("/circles/{cid}/invitations")
def list_invitations(cid: UUID, principal: RideReader, session: DatabaseSession):
    owned_circle(session, cid, principal)
    rows = session.scalars(
        active_invitations(cid).order_by(CircleInvitation.expires_at, CircleInvitation.id)
    )
    return [{"id": row.id, "expires_at": journeys.utc(row.expires_at)} for row in rows]


@router.delete("/circles/{cid}/invitations/{iid}")
def revoke_invitation(cid: UUID, iid: UUID, principal: RideWriter, session: DatabaseSession):
    with session.begin():
        owned_circle(session, cid, principal, lock=True)
        row = session.get(CircleInvitation, str(iid), with_for_update=True)
        if not row or row.circle_id != str(cid):
            raise HTTPException(404, "Invitation not found")
        if row.accepted_at:
            raise HTTPException(409, "This invitation has already been used")
        if not row.revoked_at:
            row.revoked_at = datetime.now(UTC)
    return {"revoked": True}


@router.delete("/circles/{cid}/members/me")
def leave_circle(cid: UUID, principal: RideWriter, session: DatabaseSession):
    with session.begin():
        circle = session.get(CommuteCircle, str(cid), with_for_update=True)
        member = membership(session, str(cid), principal)
        if not circle or not member:
            raise HTTPException(404, "Circle not found")
        if member.role == "owner":
            raise HTTPException(409, "The circle owner must stay in the circle")
        session.delete(member)
    return {"left": True}


@router.post("/circle-invitations/redeem")
def join_circle(data: InviteToken, principal: RideWriter, session: DatabaseSession):
    digest = hashlib.sha256(data.token.encode()).hexdigest()
    with session.begin():
        # Serialize redemption, membership changes and revocation in the same lock order.
        cid = session.scalar(
            select(CircleInvitation.circle_id).where(CircleInvitation.token_digest == digest)
        )
        circle = session.get(CommuteCircle, cid, with_for_update=True) if cid else None
        invitation = (
            session.scalar(
                active_invitations(cid)
                .where(CircleInvitation.token_digest == digest)
                .with_for_update()
            )
            if circle
            else None
        )
        if not invitation:
            raise HTTPException(410, "Invitation expired, revoked or already used")
        existing = membership(session, circle.id, principal)
        if existing:
            return display_circle(circle, existing.role)
        session.add(
            CircleMember(
                circle_id=circle.id,
                issuer=principal.issuer,
                subject=principal.subject,
                role="member",
                joined_at=datetime.now(UTC),
            )
        )
        invitation.accepted_at = datetime.now(UTC)
        result = display_circle(circle, "member")
    return result
