from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner: Mapped[str] = mapped_column(String(64), index=True)
    endpoint: Mapped[str] = mapped_column(String(2048))
    p256dh: Mapped[str] = mapped_column(String(100))
    auth: Mapped[str] = mapped_column(String(32))
    binding: Mapped[str] = mapped_column(String(36))
    updated: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PushDelivery(Base):
    __tablename__ = "message_push_deliveries"
    __table_args__ = (
        UniqueConstraint("message_id", "subscription_id", name="uq_message_push_device"),
        Index("ix_message_push_due", "state", "available"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    message_id: Mapped[str] = mapped_column(ForeignKey("booking_messages.id"))
    subscription_id: Mapped[str] = mapped_column(ForeignKey("push_subscriptions.id"))
    binding: Mapped[str] = mapped_column(String(36))
    state: Mapped[str] = mapped_column(String(16), default="queued")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    available: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated: Mapped[datetime] = mapped_column(DateTime(timezone=True))
