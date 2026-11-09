"""Confidential reports are visible only to their author and authorized case reviewers."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.api.routes.bookings import DatabaseSession
from app.auth.dependencies import RideReader, RideWriter
from app.models.journey import Journey, Ticket
from app.models.v2 import SafetyCaseEvent, SafetyReport
from app.services import journeys
from app.services.v2_common import staff

router = APIRouter(prefix="/v1", tags=["V2 safety"])


class ReportData(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    journey_id: UUID
    ticket_id: UUID | None = None
    category: str = Field(pattern="^(vehicle_mismatch|unsafe_driving|harassment|pickup_issue|other)$")
    description: str = Field(min_length=10, max_length=1500)


class CaseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    state: str = Field(pattern="^(open|reviewing|resolved|closed)$")
    note: str = Field(min_length=5, max_length=1000)


def summary(row):
    return {"id": row.id, "journey_id": row.journey_id, "category": row.category, "description": row.description, "state": row.state, "created_at": row.created_at}


@router.post("/safety-reports", status_code=201)
def report(data: ReportData, principal: RideWriter, session: DatabaseSession):
    with session.begin():
        j = session.get(Journey, str(data.journey_id))
        if not j:
            raise HTTPException(404, "Journey not found")
        authorized = journeys.is_driver(j, principal)
        if data.ticket_id:
            t = session.get(Ticket, str(data.ticket_id))
            if not t or t.journey_id != j.id:
                raise HTTPException(404, "Ticket not found")
            authorized = authorized or journeys.is_rider(t, principal)
        else:
            authorized = authorized or bool(session.scalar(select(Ticket.id).where(Ticket.journey_id == j.id, Ticket.issuer == principal.issuer, Ticket.rider == principal.subject).limit(1)))
        if not authorized:
            raise HTTPException(404, "Journey not found")
        row = SafetyReport(issuer=principal.issuer, subject=principal.subject, journey_id=j.id, ticket_id=str(data.ticket_id) if data.ticket_id else None, category=data.category, description=data.description, state="open", created_at=datetime.now(UTC))
        session.add(row)
        session.flush()
        result = summary(row)
    return result


@router.get("/me/safety-reports")
def mine(principal: RideReader, session: DatabaseSession, response: Response):
    response.headers["Cache-Control"] = "no-store"
    rows = session.scalars(select(SafetyReport).where(SafetyReport.issuer == principal.issuer, SafetyReport.subject == principal.subject).order_by(SafetyReport.created_at.desc()).limit(50))
    return [summary(row) for row in rows]


@router.get("/staff/safety-reports")
def review_queue(principal: RideReader, session: DatabaseSession, response: Response):
    staff(principal)
    response.headers["Cache-Control"] = "no-store"
    rows = session.scalars(
        select(SafetyReport).where(SafetyReport.state.in_(("open", "reviewing")))
        .order_by(SafetyReport.created_at).limit(50)
    )
    return [summary(row) for row in rows]


@router.get("/staff/safety-reports/{report_id}/events")
def case_history(report_id: UUID, principal: RideReader, session: DatabaseSession, response: Response):
    staff(principal)
    response.headers["Cache-Control"] = "no-store"
    if not session.get(SafetyReport, str(report_id)):
        raise HTTPException(404, "Report not found")
    rows = session.scalars(select(SafetyCaseEvent).where(SafetyCaseEvent.report_id == str(report_id))
                           .order_by(SafetyCaseEvent.created_at).limit(100))
    return [{"state": e.state, "note": e.note, "reviewer": e.reviewer,
             "created_at": e.created_at} for e in rows]


@router.post("/staff/safety-reports/{report_id}/review")
def review(report_id: UUID, data: CaseUpdate, principal: RideWriter, session: DatabaseSession):
    staff(principal)
    with session.begin():
        row = session.get(SafetyReport, str(report_id))
        if not row:
            raise HTTPException(404, "Report not found")
        row.state = data.state
        session.add(SafetyCaseEvent(report_id=row.id, reviewer=principal.subject, state=data.state, note=data.note, created_at=datetime.now(UTC)))
    return {"state": data.state}
