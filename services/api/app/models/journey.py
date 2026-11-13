from datetime import date, datetime
from uuid import uuid4

from sqlalchemy import JSON, CheckConstraint, Date, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Journey(Base):
    __tablename__ = "journeys"
    __table_args__ = (
        UniqueConstraint("recurring_template_id", "recurring_date", name="uq_recurring_occurrence"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    issuer: Mapped[str] = mapped_column(String(512))
    driver: Mapped[str] = mapped_column(String(255))
    departure: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_stop_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    stops: Mapped[list] = mapped_column(JSON)
    vehicle: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    preferences: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    price_paise: Mapped[int]
    capacity: Mapped[int]
    cancelled: Mapped[bool] = mapped_column(default=False)
    vehicle_registration_id: Mapped[str | None] = mapped_column(
        ForeignKey("verified_vehicles.id", name="fk_journeys_v2_vehicle"), nullable=True
    )
    booking_mode: Mapped[str] = mapped_column(String(16), default="instant")
    recurring_template_id: Mapped[str | None] = mapped_column(
        ForeignKey("recurring_rides.id", name="fk_journeys_v2_recurring"), nullable=True
    )
    recurring_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    circle_id: Mapped[str | None] = mapped_column(
        ForeignKey("commute_circles.id", name="fk_journeys_v2_circle"), nullable=True, index=True
    )


class Ticket(Base):
    __tablename__ = "journey_tickets"
    __table_args__ = (
        CheckConstraint("stars BETWEEN 1 AND 5", name="journey_review_stars"),
        CheckConstraint("board >= 0 AND board < alight", name="ordered_ticket_stops"),
        CheckConstraint(
            "refund >= 0 AND refund <= charged AND charged <= fare", name="ticket_amounts"
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    journey_id: Mapped[str] = mapped_column(ForeignKey("journeys.id"), index=True)
    issuer: Mapped[str] = mapped_column(String(512))
    rider: Mapped[str] = mapped_column(String(255))
    board: Mapped[int]
    alight: Mapped[int]
    state: Mapped[str] = mapped_column(String(24), index=True)
    expires: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    fare: Mapped[int]
    charged: Mapped[int] = mapped_column(default=0)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    declined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    consent_version: Mapped[str | None] = mapped_column(String(24), nullable=True)
    consent_fare_paise: Mapped[int | None] = mapped_column(nullable=True)
    consent_pickup_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    travel_state: Mapped[str | None] = mapped_column(String(24), nullable=True)
    boarded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    stars: Mapped[int | None]
    refund: Mapped[int] = mapped_column(default=0)


class PaymentEntry(Base):
    """Sandbox ledger entries committed in the same transaction as seat changes."""

    __tablename__ = "payment_entries"
    __table_args__ = (CheckConstraint("amount > 0", name="positive_payment_entry"),)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("journey_tickets.id"), primary_key=True)
    kind: Mapped[str] = mapped_column(String(24), primary_key=True)
    amount: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
