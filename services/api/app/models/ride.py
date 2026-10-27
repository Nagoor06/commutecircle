from datetime import datetime
from uuid import uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Ride(Base):
    __tablename__ = "rides"
    __table_args__ = (
        CheckConstraint("seats_available BETWEEN 1 AND 8", name="valid_ride_seats"),
        CheckConstraint("origin_id <> destination_id", name="different_ride_points"),
        Index("ix_rides_route_departure", "origin_id", "destination_id", "departure_at"),
        Index("ix_rides_owner", "driver_issuer", "driver_subject"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    driver_issuer: Mapped[str] = mapped_column(String(512))
    driver_subject: Mapped[str] = mapped_column(String(255))
    origin_id: Mapped[int] = mapped_column(ForeignKey("pickup_points.id", ondelete="RESTRICT"))
    destination_id: Mapped[int] = mapped_column(ForeignKey("pickup_points.id", ondelete="RESTRICT"))
    departure_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    seats_available: Mapped[int]
