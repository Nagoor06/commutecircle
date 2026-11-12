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
from app.services import journey_catalog
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
        circle = session.get(CommuteCircle, str(cid), with_for_update=True)
        member = membership(session, str(cid), principal)
        if not circle or not member or member.role != "owner":
            raise HTTPException(404, "Circle not found")
        active_invites = session.scalar(
            select(CircleInvitation.id)
            .where(
                CircleInvitation.circle_id == circle.id,
                CircleInvitation.accepted_at.is_(None),
                CircleInvitation.expires_at > datetime.now(UTC),
            )
            .offset(9)
            .limit(1)
        )
        if active_invites:
            raise HTTPException(429, "Too many active invitations")
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(UTC) + INVITATION_LIFETIME
        session.add(
            CircleInvitation(
                circle_id=circle.id,
                token_digest=hashlib.sha256(token.encode()).hexdigest(),
                expires_at=expires_at,
            )
        )
    return {
        "token": token,
        "expires_at": expires_at,
        "expires_in_seconds": int(INVITATION_LIFETIME.total_seconds()),
        "warning": "Anyone with this invitation can join until it is used or expires",
    }


@router.post("/circle-invitations/redeem")
def join_circle(data: InviteToken, principal: RideWriter, session: DatabaseSession):
    digest = hashlib.sha256(data.token.encode()).hexdigest()
    with session.begin():
        invitation = session.scalar(
            select(CircleInvitation)
            .where(CircleInvitation.token_digest == digest)
            .with_for_update()
        )
        if (
            not invitation
            or invitation.accepted_at
            or invitation.expires_at.replace(tzinfo=UTC) <= datetime.now(UTC)
        ):
            raise HTTPException(410, "Invite expired or already used")
        circle = session.get(CommuteCircle, invitation.circle_id, with_for_update=True)
        if not circle:
            raise HTTPException(410, "Circle unavailable")
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
