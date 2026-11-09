from datetime import datetime
from uuid import uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"
    owner: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str | None] = mapped_column(String(254))
    email_enabled: Mapped[bool] = mapped_column(default=False)
    phone: Mapped[str | None] = mapped_column(String(16))
    phone_channel: Mapped[str] = mapped_column(String(12), default="none")
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pending_phone: Mapped[str | None] = mapped_column(String(16))
    challenge: Mapped[str | None] = mapped_column(String(36))
    verification_sid: Mapped[str | None] = mapped_column(String(34))
    verification_expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verification_attempts: Mapped[int] = mapped_column(default=0)


class VerificationLimit(Base):
    """Durable per-account, per-number and global verification budgets. No raw numbers."""

    __tablename__ = "notification_verification_limits"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    window: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    count: Mapped[int]


class Notification(Base):
    __tablename__ = "booking_notifications"
    __table_args__ = (UniqueConstraint("ticket_id", "event", "channel", name="one_booking_alert"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    ticket_id: Mapped[str] = mapped_column(ForeignKey("journey_tickets.id"), index=True)
    owner: Mapped[str] = mapped_column(String(64), index=True)
    event: Mapped[str] = mapped_column(String(24))
    channel: Mapped[str] = mapped_column(String(12))
    recipient: Mapped[str] = mapped_column(String(254))
    payload: Mapped[dict] = mapped_column(JSON)
    state: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    available: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    attempts: Mapped[int] = mapped_column(default=0)
    provider_id: Mapped[str | None] = mapped_column(String(100))
