from datetime import UTC, datetime

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator


class RideCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    origin_id: int = Field(gt=0, strict=True)
    destination_id: int = Field(gt=0, strict=True)
    departure_at: AwareDatetime
    seats_available: int = Field(ge=1, le=8, strict=True)

    @model_validator(mode="after")
    def validate_route(self):
        if self.origin_id == self.destination_id:
            raise ValueError("Origin and destination must differ")
        return self


class RideOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    origin_id: int
    destination_id: int
    departure_at: datetime
    seats_available: int

    @field_validator("departure_at")
    @classmethod
    def utc_departure(cls, value: datetime):
        # SQLite strips offsets; service writes are always normalized to UTC.
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
