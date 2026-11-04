from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Message(Base):
    __tablename__ = "booking_messages"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("journey_tickets.id"), index=True)
    sender: Mapped[str] = mapped_column(String(10))
    text: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ChatBlock(Base):
    __tablename__ = "booking_chat_blocks"
    ticket_id: Mapped[str] = mapped_column(ForeignKey("journey_tickets.id"), primary_key=True)
    role: Mapped[str] = mapped_column(String(10), primary_key=True)
