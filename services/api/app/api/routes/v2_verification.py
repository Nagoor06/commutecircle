"""Profiles and staff-reviewed driver/vehicle eligibility. No self-approved badges."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.api.routes.bookings import DatabaseSession
from app.auth.dependencies import RideReader, RideWriter
from app.models.v2 import CommuterProfile, DriverVerification, VerifiedVehicle
from app.services.v2_common import staff

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
        row = session.get(CommuterProfile, (principal.issuer, principal.subject))
        if row:
            row.display_name = data.display_name
        else:
            session.add(
                CommuterProfile(
                    issuer=principal.issuer,
                    subject=principal.subject,
                    display_name=data.display_name,
                    created_at=datetime.now(UTC),
                )
            )
    return {"display_name": data.display_name}


@router.post("/me/driver-verification", status_code=202)
def apply(data: DriverApplication, principal: RideWriter, session: DatabaseSession):
    with session.begin():
        row = session.get(DriverVerification, (principal.issuer, principal.subject))
        if row and row.status in ("approved", "suspended"):
            raise HTTPException(409, "Existing verification requires staff review")
        if row:
            row.status, row.evidence_reference = "pending", data.evidence_reference
            row.submitted_at, row.reviewed_at, row.reviewer = datetime.now(UTC), None, None
        else:
            session.add(
                DriverVerification(
                    issuer=principal.issuer,
                    subject=principal.subject,
                    status="pending",
                    evidence_reference=data.evidence_reference,
                    submitted_at=datetime.now(UTC),
                )
            )
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
            .order_by(VerifiedVehicle.submitted_at.desc())
            .limit(25)
        )
    )
    return {
        "driver_status": row.status if row else "unverified",
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
        select(DriverVerification).where(DriverVerification.status == "pending").limit(50)
    )
    return [
        {
            "issuer": r.issuer,
            "subject": r.subject,
            "status": r.status,
            "evidence_reference": r.evidence_reference,
        }
        for r in rows
    ]


@router.get("/staff/vehicles")
def pending_vehicles(principal: RideReader, session: DatabaseSession, response: Response):
    staff(principal)
    response.headers["Cache-Control"] = "no-store"
    rows = session.scalars(
        select(VerifiedVehicle).where(VerifiedVehicle.status == "pending").limit(50)
    )
    return [
        {"id": r.id, "issuer": r.issuer, "subject": r.subject, **visible_vehicle(r, True)}
        for r in rows
    ]


@router.post("/staff/driver-verifications/{subject}/decision")
def decide_driver(subject: str, data: Decision, principal: RideWriter, session: DatabaseSession):
    staff(principal)
    with session.begin():
        row = session.get(DriverVerification, (principal.issuer, subject))
        if not row:
            raise HTTPException(404, "Application not found")
        if (row.issuer, row.subject) == (principal.issuer, principal.subject):
            raise HTTPException(403, "Self-review is prohibited")
        row.status = data.decision
        row.reviewer, row.reviewed_at = principal.subject, datetime.now(UTC)
    return {"status": row.status}


@router.post("/staff/vehicles/{vehicle_id}/decision")
def decide_vehicle(
    vehicle_id: UUID, data: Decision, principal: RideWriter, session: DatabaseSession
):
    staff(principal)
    with session.begin():
        row = session.get(VerifiedVehicle, str(vehicle_id))
        if not row:
            raise HTTPException(404, "Vehicle not found")
        if (row.issuer, row.subject) == (principal.issuer, principal.subject):
            raise HTTPException(403, "Self-review is prohibited")
        row.status = data.decision
        row.reviewer, row.reviewed_at = principal.subject, datetime.now(UTC)
    return {"status": row.status}
