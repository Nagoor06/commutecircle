"""Recurring ride templates with bounded, idempotent occurrence creation.

Only the owner materializes. Occurrences use existing Journey/Ticket seats and ledger.
"""

import calendar
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.routes.bookings import DatabaseSession
from app.auth.dependencies import RideReader, RideWriter
from app.models.journey import Journey
from app.models.v2 import CircleMember, RecurringException, RecurringRide
from app.schemas.journey import Stop
from app.services.v2_common import eligible_driver, required_verification

router = APIRouter(prefix="/v1/recurring-rides", tags=["V2 recurring rides"])


class RecurringInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stops: list[Stop] = Field(min_length=2, max_length=16)
    local_time: time
    timezone: str = "Asia/Kolkata"
    weekdays: set[int] = Field(min_length=1, max_length=7)
    starts_on: date
    ends_on: date
    price_paise: int = Field(ge=100, le=10000000)
    capacity: int = Field(ge=1, le=8)
    vehicle_id: UUID | None = None
    booking_mode: str = Field(pattern="^(approval|instant)$")
    circle_id: UUID | None = None

    @model_validator(mode="after")
    def valid(self):
        if self.timezone != "Asia/Kolkata":
            raise ValueError("Pilot schedules currently support Asia/Kolkata only")
        if any(d < 0 or d > 6 for d in self.weekdays):
            raise ValueError("Weekdays must be 0 Monday through 6 Sunday")
        if self.starts_on > self.ends_on or (self.ends_on - self.starts_on).days > 90:
            raise ValueError("Schedule dates must cover at most 90 days")
        if self.stops[0].metres or self.stops[0].minutes:
            raise ValueError("First stop must have zero time and distance")
        for a, b in zip(self.stops, self.stops[1:]):
            if b.metres <= a.metres or b.minutes <= a.minutes:
                raise ValueError("Route distance and time must increase")
        return self


class ExceptionInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    reason: str = Field(default="", max_length=120)


def own(row, p):
    return row and row.issuer == p.issuer and row.driver == p.subject


def view(row):
    return {"id": row.id, "stops": row.stops, "local_time": row.local_time, "timezone": row.timezone, "weekdays": row.weekdays, "starts_on": row.starts_on, "ends_on": row.ends_on, "capacity": row.capacity, "price_paise": row.price_paise, "booking_mode": row.booking_mode, "circle_id": row.circle_id, "active": row.active}


@router.post("", status_code=201)
def create(data: RecurringInput, principal: RideWriter, session: DatabaseSession):
    with session.begin():
        if data.booking_mode == "approval" or required_verification():
            eligible_driver(session, principal, str(data.vehicle_id) if data.vehicle_id else None, data.capacity)
        if data.circle_id:
            member = session.get(CircleMember, (str(data.circle_id), principal.issuer, principal.subject))
            if not member or member.role != "owner":
                raise HTTPException(404, "Circle not found")
        row = RecurringRide(issuer=principal.issuer, driver=principal.subject, stops=[s.model_dump(exclude_none=True) for s in data.stops], local_time=data.local_time.strftime("%H:%M"), timezone=data.timezone, weekdays=sorted(data.weekdays), starts_on=data.starts_on, ends_on=data.ends_on, price_paise=data.price_paise, capacity=data.capacity, vehicle_id=str(data.vehicle_id) if data.vehicle_id else None, booking_mode=data.booking_mode, circle_id=str(data.circle_id) if data.circle_id else None, active=True, created_at=datetime.now(UTC))
        session.add(row)
        session.flush()
        result = view(row)
    return result


@router.get("")
def mine(principal: RideReader, session: DatabaseSession, response: Response):
    response.headers["Cache-Control"] = "no-store"
    rows = session.scalars(select(RecurringRide).where(RecurringRide.issuer == principal.issuer, RecurringRide.driver == principal.subject).order_by(RecurringRide.created_at.desc()).limit(50))
    return [view(r) for r in rows]


@router.put("/{rid}/exceptions/{service_date}")
def exception(rid: UUID, service_date: date, data: ExceptionInput, principal: RideWriter, session: DatabaseSession):
    with session.begin():
        row = session.get(RecurringRide, str(rid))
        if not own(row, principal):
            raise HTTPException(404, "Recurring ride not found")
        if not row.starts_on <= service_date <= row.ends_on:
            raise HTTPException(422, "Date is outside the template")
        exc = session.get(RecurringException, (str(rid), service_date))
        if exc:
            exc.reason = data.reason
        else:
            session.add(RecurringException(template_id=str(rid), service_date=service_date, reason=data.reason))
        journey = session.scalar(select(Journey).where(Journey.recurring_template_id == str(rid), Journey.recurring_date == service_date).with_for_update())
        if journey and not journey.cancelled:
            # Preserve full driver-cancellation refund semantics; never silently cancel paid tickets.
            from app.services.journeys import cancel_all
            if session.scalar(select(__import__("app.models.journey", fromlist=["Ticket"]).Ticket.id).where(__import__("app.models.journey", fromlist=["Ticket"]).Ticket.journey_id == journey.id).limit(1)):
                raise HTTPException(409, "Existing bookings require explicit driver cancellation first")
            journey.cancelled = True
    return {"skipped": True, "date": service_date}


@router.post("/{rid}/materialize")
def materialize(rid: UUID, principal: RideWriter, session: DatabaseSession):
    # Serialize creation via template lock; the unique constraint is a second guard.
    with session.begin():
        row = session.scalar(select(RecurringRide).where(RecurringRide.id == str(rid)).with_for_update())
        if not own(row, principal):
            raise HTTPException(404, "Recurring ride not found")
        if not row.active:
            raise HTTPException(409, "Template is inactive")
        if row.booking_mode == "approval" or required_verification():
            eligible_driver(session, principal, row.vehicle_id, row.capacity)
        today = datetime.now(ZoneInfo(row.timezone)).date()
        start = max(row.starts_on, today)
        end = min(row.ends_on, today + timedelta(days=13))
        skip = set(session.scalars(select(RecurringException.service_date).where(RecurringException.template_id == row.id)))
        already = set(session.scalars(select(Journey.recurring_date).where(Journey.recurring_template_id == row.id)))
        results = []
        if end >= start:
            for offset in range((end - start).days + 1):
                d = start + timedelta(days=offset)
                if d in skip or d in already or d.weekday() not in row.weekdays:
                    continue
                departure = datetime.combine(d, time.fromisoformat(row.local_time), ZoneInfo(row.timezone)).astimezone(UTC)
                if departure <= datetime.now(UTC):
                    continue
                j = Journey(issuer=row.issuer, driver=row.driver, stops=row.stops, departure=departure, last_stop_at=departure + timedelta(minutes=row.stops[-1]["minutes"]), price_paise=row.price_paise, capacity=row.capacity, cancelled=False, booking_mode=row.booking_mode, vehicle_registration_id=row.vehicle_id, recurring_template_id=row.id, recurring_date=d, circle_id=row.circle_id)
                session.add(j)
                session.flush()
                results.append({"id": j.id, "date": d})
    return {"created": results, "count": len(results)}
