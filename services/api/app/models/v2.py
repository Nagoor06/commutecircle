"""CommuteCircle V2 trust, approval, boarding, recurring, and private-circle records."""

from datetime import date, datetime
from uuid import uuid4

from sqlalchemy import JSON, Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def uid():
    return str(uuid4())


class CommuterProfile(Base):
    __tablename__ = "commuter_profiles"
    issuer: Mapped[str] = mapped_column(String(512), primary_key=True)
    subject: Mapped[str] = mapped_column(String(255), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class DriverVerification(Base):
    __tablename__ = "driver_verifications"
    issuer: Mapped[str] = mapped_column(String(512), primary_key=True)
    subject: Mapped[str] = mapped_column(String(255), primary_key=True)
    status: Mapped[str] = mapped_column(String(16))
    evidence_reference: Mapped[str | None] = mapped_column(String(128))
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewer: Mapped[str | None] = mapped_column(String(255))
    __table_args__ = (
        CheckConstraint("status IN ('pending','approved','rejected','suspended')", name="valid_driver_verification"),
    )


class VerifiedVehicle(Base):
    __tablename__ = "verified_vehicles"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    issuer: Mapped[str] = mapped_column(String(512))
    subject: Mapped[str] = mapped_column(String(255))
    make: Mapped[str] = mapped_column(String(60))
    model: Mapped[str] = mapped_column(String(60))
    color: Mapped[str] = mapped_column(String(40))
    registration: Mapped[str] = mapped_column(String(24))
    seat_capacity: Mapped[int]
    status: Mapped[str] = mapped_column(String(16), default="pending")
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewer: Mapped[str | None] = mapped_column(String(255))
    __table_args__ = (
        Index("ix_verified_vehicles_owner", "issuer", "subject"),
        CheckConstraint("status IN ('pending','approved','rejected','suspended')", name="valid_vehicle_verification"),
        CheckConstraint("seat_capacity BETWEEN 1 AND 8", name="valid_vehicle_capacity"),
    )


class BoardingChallenge(Base):
    __tablename__ = "boarding_challenges"
    ticket_id: Mapped[str] = mapped_column(ForeignKey("journey_tickets.id"), primary_key=True)
    salt: Mapped[str] = mapped_column(String(64))
    digest: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(default=0)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TripEvent(Base):
    __tablename__ = "trip_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    journey_id: Mapped[str] = mapped_column(ForeignKey("journeys.id"))
    ticket_id: Mapped[str | None] = mapped_column(ForeignKey("journey_tickets.id"))
    issuer: Mapped[str] = mapped_column(String(512))
    subject: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    __table_args__ = (Index("ix_trip_events_journey", "journey_id", "created_at"),)


class SafetyReport(Base):
    __tablename__ = "safety_reports"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    issuer: Mapped[str] = mapped_column(String(512))
    subject: Mapped[str] = mapped_column(String(255))
    journey_id: Mapped[str] = mapped_column(ForeignKey("journeys.id"))
    ticket_id: Mapped[str | None] = mapped_column(ForeignKey("journey_tickets.id"))
    category: Mapped[str] = mapped_column(String(32))
    description: Mapped[str] = mapped_column(String(1500))
    state: Mapped[str] = mapped_column(String(24), default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    __table_args__ = (Index("ix_safety_reports_owner", "issuer", "subject", "created_at"),)


class SafetyCaseEvent(Base):
    __tablename__ = "safety_case_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    report_id: Mapped[str] = mapped_column(ForeignKey("safety_reports.id"))
    reviewer: Mapped[str] = mapped_column(String(255))
    state: Mapped[str] = mapped_column(String(24))
    note: Mapped[str] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    __table_args__ = (Index("ix_safety_case_events_report", "report_id", "created_at"),)


class RecurringRide(Base):
    __tablename__ = "recurring_rides"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    issuer: Mapped[str] = mapped_column(String(512))
    driver: Mapped[str] = mapped_column(String(255))
    stops: Mapped[list] = mapped_column(JSON)
    local_time: Mapped[str] = mapped_column(String(5))
    timezone: Mapped[str] = mapped_column(String(64))
    weekdays: Mapped[list] = mapped_column(JSON)
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date] = mapped_column(Date)
    price_paise: Mapped[int]
    capacity: Mapped[int]
    vehicle_id: Mapped[str | None] = mapped_column(ForeignKey("verified_vehicles.id"))
    booking_mode: Mapped[str] = mapped_column(String(16))
    circle_id: Mapped[str | None] = mapped_column(String(36))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    __table_args__ = (Index("ix_recurring_rides_driver", "issuer", "driver"),)


class RecurringException(Base):
    __tablename__ = "recurring_exceptions"
    template_id: Mapped[str] = mapped_column(ForeignKey("recurring_rides.id"), primary_key=True)
    service_date: Mapped[date] = mapped_column(Date, primary_key=True)
    reason: Mapped[str] = mapped_column(String(120), default="")


class CommuteCircle(Base):
    __tablename__ = "commute_circles"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(80))
    issuer: Mapped[str] = mapped_column(String(512))
    owner: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CircleMember(Base):
    __tablename__ = "circle_members"
    circle_id: Mapped[str] = mapped_column(ForeignKey("commute_circles.id"), primary_key=True)
    issuer: Mapped[str] = mapped_column(String(512), primary_key=True)
    subject: Mapped[str] = mapped_column(String(255), primary_key=True)
    role: Mapped[str] = mapped_column(String(16))
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    __table_args__ = (Index("ix_circle_members_owner", "issuer", "subject"),)


class CircleInvitation(Base):
    __tablename__ = "circle_invitations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    circle_id: Mapped[str] = mapped_column(ForeignKey("commute_circles.id"))
    token_digest: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (Index("ix_circle_invitations_circle", "circle_id"),)
