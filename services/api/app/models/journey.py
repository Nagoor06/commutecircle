from datetime import datetime
from uuid import uuid4

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Journey(Base):
    __tablename__ = "journeys"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    issuer: Mapped[str] = mapped_column(String(512))
    driver: Mapped[str] = mapped_column(String(255))
    departure: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_stop_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    stops: Mapped[list] = mapped_column(JSON)
    price_paise: Mapped[int]
    capacity: Mapped[int]
    cancelled: Mapped[bool] = mapped_column(default=False)


class Ticket(Base):
    __tablename__ = "journey_tickets"
    __table_args__ = (
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
    state: Mapped[str] = mapped_column(String(24))
    expires: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    fare: Mapped[int]
    charged: Mapped[int] = mapped_column(default=0)
    refund: Mapped[int] = mapped_column(default=0)
