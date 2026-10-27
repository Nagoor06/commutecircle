from pydantic import BaseModel, ConfigDict, Field

from app.schemas.pickup_point import PickupPointOut


class NearbyQuery(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    radius_m: int = Field(default=2000, ge=50, le=5000)
    limit: int = Field(default=10, ge=1, le=20)


class NearbyPoint(PickupPointOut):
    distance_m: int
