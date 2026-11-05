from datetime import datetime
from uuid import uuid4

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, String, false
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TrustedContact(Base):
    __tablename__ = "trusted_contacts"
    __table_args__ = (CheckConstraint("slot BETWEEN 1 AND 5", name="trusted_contact_slot"),)
    issuer: Mapped[str] = mapped_column(String(512), primary_key=True)
    subject: Mapped[str] = mapped_column(String(255), primary_key=True)
    slot: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    channel: Mapped[str] = mapped_column(String(10))
    destination: Mapped[str] = mapped_column(String(160))


class TripShare(Base):
    __tablename__ = "trip_shares"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    issuer: Mapped[str] = mapped_column(String(512))
    subject: Mapped[str] = mapped_column(String(255))
    journey_id: Mapped[str] = mapped_column(ForeignKey("journeys.id"), index=True)
    ticket_id: Mapped[str | None] = mapped_column(ForeignKey("journey_tickets.id"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(default=False)
    passengers_allowed: Mapped[bool] = mapped_column(default=False, server_default=false())
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    accuracy_m: Mapped[float | None] = mapped_column(Float)
    observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sequence: Mapped[int] = mapped_column(default=0)
