from sqlalchemy import JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Commute(Base):
    __tablename__ = "commute_preferences"
    issuer: Mapped[str] = mapped_column(String(512), primary_key=True)
    subject: Mapped[str] = mapped_column(String(255), primary_key=True)
    # Only selected public meeting points; never a residence or device location.
    pickup: Mapped[dict] = mapped_column(JSON)
    workplace: Mapped[dict] = mapped_column(JSON)
    employer: Mapped[str] = mapped_column(String(80), default="")
