from pydantic import BaseModel, ConfigDict


class PickupPointOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    city: str
    latitude: float
    longitude: float
