from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Vehicle(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    make: str = Field(min_length=1, max_length=60)
    model: str = Field(min_length=1, max_length=60)
    color: str = Field(min_length=1, max_length=40)
    purchased_on: date
    condition: Literal["excellent", "good", "fair"]

    @field_validator("purchased_on")
    @classmethod
    def valid_purchase(cls, value: date):
        if not date(1886, 1, 1) <= value <= date.today():
            raise ValueError("Enter a purchase date in the past or today")
        return value


class Review(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stars: int = Field(ge=1, le=5, strict=True)


class DriverRating(BaseModel):
    average: float | None
    count: int


class RideDetails(BaseModel):
    cancelled: bool
    vehicle: Vehicle | None
    driver_rating: DriverRating
