from sqlalchemy import CheckConstraint, Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PickupPoint(Base):
    __tablename__ = "pickup_points"
    __table_args__ = (
        CheckConstraint("latitude BETWEEN -90 AND 90", name="valid_latitude"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="valid_longitude"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    city: Mapped[str] = mapped_column(String(80), index=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
