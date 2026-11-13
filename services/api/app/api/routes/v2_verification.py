"""Profiles and staff-reviewed driver/vehicle eligibility. No self-approved badges."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, Response
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.api.routes.bookings import DatabaseSession
from app.auth.dependencies import RideReader, RideWriter
from app.db.session import insert_for
from app.models.v2 import CommuterProfile, DriverVerification, VerifiedVehicle
from app.services.journeys import utc
from app.services.v2_common import required_verification, staff

router = APIRouter(prefix="/v1", tags=["V2 verification"])


class ProfileData(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    display_name: str = Field(min_length=2, max_length=80)


class DriverApplication(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    # An opaque reference to a document verified outside this API, not uploaded PII.
    evidence_reference: str = Field(min_length=6, max_length=128)


class VehicleData(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    make: str = Field(min_length=1, max_length=60)
    model: str = Field(min_length=1, max_length=60)
    color: str = Field(min_length=1, max_length=40)
    registration: str = Field(min_length=5, max_length=24)
    seat_capacity: int = Field(ge=1, le=8)


class Decision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: str = Field(pattern="^(approved|rejected|suspended)$")
    expected_status: str | None = Field(
        default=None, pattern="^(pending|approved|rejected|suspended)$"
    )
    expected_submitted_at: AwareDatetime | None = None


def visible_vehicle(row, owner_view=False):
    result = {
        "id": row.id,
        "make": row.make,
        "model": row.model,
        "color": row.color,
        "seat_capacity": row.seat_capacity,
        "status": row.status,
    }
    if owner_view:
        result["registration"] = row.registration
    return result


@router.get("/me/profile")
def profile(principal: RideReader, session: DatabaseSession, response: Response):
    response.headers["Cache-Control"] = "no-store"
    row = session.get(CommuterProfile, (principal.issuer, principal.subject))
    return {"display_name": row.display_name if row else None}


@router.put("/me/profile")
def save_profile(data: ProfileData, principal: RideWriter, session: DatabaseSession):
    with session.begin():
        stmt = insert_for(session, CommuterProfile).values(
            issuer=principal.issuer,
            subject=principal.subject,
            display_name=data.display_name,
            created_at=datetime.now(UTC),
        )
        session.execute(
            stmt.on_conflict_do_update(
                index_elements=["issuer", "subject"], set_={"display_name": data.display_name}
            )
        )
    return {"display_name": data.display_name}


@router.post("/me/driver-verification", status_code=202)
def apply(data: DriverApplication, principal: RideWriter, session: DatabaseSession):
    with session.begin():
        submitted = datetime.now(UTC)
        values = dict(
            status="pending",
            evidence_reference=data.evidence_reference,
            submitted_at=submitted,
            reviewed_at=None,
            reviewer=None,
        )
        stmt = insert_for(session, DriverVerification).values(
            issuer=principal.issuer, subject=principal.subject, **values
        )
        result = session.execute(
            stmt.on_conflict_do_update(
                index_elements=["issuer", "subject"],
                set_=values,
                where=DriverVerification.status.in_(("pending", "rejected")),
            ).returning(DriverVerification.status)
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(409, "Existing verification requires staff review")
    return {"status": "pending", "message": "Application recorded; not verified until reviewed"}


@router.post("/me/vehicles", status_code=201)
def submit_vehicle(data: VehicleData, principal: RideWriter, session: DatabaseSession):
    with session.begin():
        row = VerifiedVehicle(
            issuer=principal.issuer,
            subject=principal.subject,
            make=data.make,
            model=data.model,
            color=data.color,
            registration=data.registration.upper(),
            seat_capacity=data.seat_capacity,
            status="pending",
            submitted_at=datetime.now(UTC),
        )
        session.add(row)
        session.flush()
        result = visible_vehicle(row, True)
    return result


@router.get("/me/driver-eligibility")
def eligibility(principal: RideReader, session: DatabaseSession, response: Response):
    response.headers["Cache-Control"] = "no-store"
    row = session.get(DriverVerification, (principal.issuer, principal.subject))
    vehicles = list(
        session.scalars(
            select(VerifiedVehicle)
            .where(
                VerifiedVehicle.issuer == principal.issuer,
                VerifiedVehicle.subject == principal.subject,
            )
            .order_by(
                (VerifiedVehicle.status == "approved").desc(),
                VerifiedVehicle.submitted_at.desc(),
                VerifiedVehicle.id,
            )
            .limit(25)
        )
    )
    return {
        "driver_status": row.status if row else "unverified",
        "instant_requires_verification": required_verification(),
        "vehicles": [visible_vehicle(v, True) for v in vehicles],
        "can_offer": bool(
            row and row.status == "approved" and any(v.status == "approved" for v in vehicles)
        ),
    }


@router.get("/staff/driver-verifications")
def pending_drivers(principal: RideReader, session: DatabaseSession, response: Response):
    staff(principal)
    response.headers["Cache-Control"] = "no-store"
    rows = session.scalars(
        select(DriverVerification)
        .where(
            DriverVerification.issuer == principal.issuer, DriverVerification.status == "pending"
        )
        .order_by(DriverVerification.submitted_at, DriverVerification.subject)
        .limit(50)
    )
    return [
        {
            "issuer": r.issuer,
            "subject": r.subject,
            "status": r.status,
            "evidence_reference": r.evidence_reference,
            "submitted_at": utc(r.submitted_at),
        }
        for r in rows
    ]


@router.get("/staff/vehicles")
def pending_vehicles(principal: RideReader, session: DatabaseSession, response: Response):
    staff(principal)
    response.headers["Cache-Control"] = "no-store"
    rows = session.scalars(
        select(VerifiedVehicle)
        .where(VerifiedVehicle.issuer == principal.issuer, VerifiedVehicle.status == "pending")
        .order_by(VerifiedVehicle.submitted_at, VerifiedVehicle.id)
        .limit(50)
    )
    return [
        {
            "issuer": r.issuer,
            "subject": r.subject,
            "submitted_at": utc(r.submitted_at),
            **visible_vehicle(r, True),
        }
        for r in rows
    ]


def record_decision(row, data, principal):
    if (row.issuer, row.subject) == (principal.issuer, principal.subject):
        raise HTTPException(403, "Self-review is prohibited")
    if (data.expected_status is not None and row.status != data.expected_status) or (
        data.expected_submitted_at is not None
        and utc(row.submitted_at) != data.expected_submitted_at
    ):
        raise HTTPException(409, "This application changed. Refresh the queue before reviewing it.")
    if row.status != data.decision:
        row.status = data.decision
        row.reviewer, row.reviewed_at = principal.subject, datetime.now(UTC)
    return {"status": row.status}


@router.post("/staff/driver-verifications/{subject}/decision")
def decide_driver(subject: str, data: Decision, principal: RideWriter, session: DatabaseSession):
    staff(principal)
    with session.begin():
        row = session.get(DriverVerification, (principal.issuer, subject), with_for_update=True)
        if not row:
            raise HTTPException(404, "Application not found")
        return record_decision(row, data, principal)


@router.post("/staff/vehicles/{vehicle_id}/decision")
def decide_vehicle(
    vehicle_id: UUID, data: Decision, principal: RideWriter, session: DatabaseSession
):
    staff(principal)
    with session.begin():
        row = session.get(VerifiedVehicle, str(vehicle_id), with_for_update=True)
        if not row or row.issuer != principal.issuer:
            raise HTTPException(404, "Vehicle not found")
        return record_decision(row, data, principal)
