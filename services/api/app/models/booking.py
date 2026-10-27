from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        UniqueConstraint("ride_id", "rider_issuer", "rider_subject", name="uq_booking_rider_ride"),
        CheckConstraint(
            "status IN ('pending', 'accepted', 'rejected', 'cancelled')",
            name="valid_booking_status",
        ),
        Index("ix_bookings_rider", "rider_issuer", "rider_subject"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    ride_id: Mapped[str] = mapped_column(ForeignKey("rides.id", ondelete="RESTRICT"))
    rider_issuer: Mapped[str] = mapped_column(String(512))
    rider_subject: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(16), default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
