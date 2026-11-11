"""Shared V2 permission checks. The JWT issuer + subject is the account identity."""

import os
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select

from app.models.v2 import CircleMember, DriverVerification, VerifiedVehicle


def now():
    return datetime.now(UTC)


def owner(row, p, subject_field="subject"):
    return row.issuer == p.issuer and getattr(row, subject_field) == p.subject


def staff(p):
    if "v2:staff" not in p.scopes:
        raise HTTPException(403, "Staff permission required")


def eligible_driver(session, principal, vehicle_id, capacity=None):
    driver = session.get(DriverVerification, (principal.issuer, principal.subject))
    vehicle = session.get(VerifiedVehicle, vehicle_id) if vehicle_id else None
    if (
        not driver
        or driver.status != "approved"
        or not vehicle
        or vehicle.status != "approved"
        or not owner(vehicle, principal)
    ):
        raise HTTPException(403, "Verified driver and approved vehicle required")
    if capacity is not None and capacity > vehicle.seat_capacity:
        raise HTTPException(422, "More passengers than approved vehicle capacity")
    return vehicle


def verify_access(session, journey, principal, allow_ticket=False):
    if not getattr(journey, "circle_id", None):
        return
    if principal:
        if (journey.issuer, journey.driver) == (principal.issuer, principal.subject):
            return
        member = session.get(CircleMember, (journey.circle_id, principal.issuer, principal.subject))
        if member:
            return
        if allow_ticket:
            from app.models.journey import Ticket

            found = session.scalar(
                select(Ticket.id)
                .where(
                    Ticket.journey_id == journey.id,
                    Ticket.issuer == principal.issuer,
                    Ticket.rider == principal.subject,
                )
                .limit(1)
            )
            if found:
                return
    raise HTTPException(404, "Journey not found")


def required_verification():
    return os.getenv("V2_REQUIRE_DRIVER_VERIFICATION", "false").lower() == "true"
