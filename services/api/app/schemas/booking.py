from typing import Literal

from pydantic import BaseModel, ConfigDict


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    ride_id: str
    status: Literal["pending", "accepted", "rejected", "cancelled"]
