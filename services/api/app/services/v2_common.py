"""Shared V2 permission checks. The JWT issuer + subject is the account identity."""

import os

from fastapi import HTTPException
from sqlalchemy import select

from app.models.journey import Journey
from app.models.v2 import CircleMember, DriverVerification, VerifiedVehicle


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


def public_vehicle(journey, registration):
    if not journey.vehicle_registration_id:
        return journey.vehicle
    if not registration or (
        registration.status != "approved"
        or (registration.issuer, registration.subject) != (journey.issuer, journey.driver)
        or journey.capacity > registration.seat_capacity
    ):
        return None
    return {
        "make": registration.make,
        "model": registration.model,
        "color": registration.color,
        "verified": True,
    }


def bookable_journeys():
    """SQL predicate shared by discovery, quoting and reservation transitions."""
    driver = (
        select(DriverVerification.subject)
        .where(
            DriverVerification.issuer == Journey.issuer,
            DriverVerification.subject == Journey.driver,
            DriverVerification.status == "approved",
        )
        .exists()
    )
    vehicle = (
        select(VerifiedVehicle.id)
        .where(
            VerifiedVehicle.id == Journey.vehicle_registration_id,
            VerifiedVehicle.issuer == Journey.issuer,
            VerifiedVehicle.subject == Journey.driver,
            VerifiedVehicle.status == "approved",
            VerifiedVehicle.seat_capacity >= Journey.capacity,
        )
        .exists()
    )
    return ((Journey.booking_mode == "instant") & Journey.vehicle_registration_id.is_(None)) | (
        driver & vehicle
    )


def check_booking_eligibility(session, journey):
    if journey.booking_mode == "instant" and journey.vehicle_registration_id is None:
        return
    if not session.scalar(select(Journey.id).where(Journey.id == journey.id, bookable_journeys())):
        raise HTTPException(409, "Driver or vehicle eligibility is under review")


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
