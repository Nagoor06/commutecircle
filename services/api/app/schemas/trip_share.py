import re
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class ContactInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=60)
    channel: Literal["share", "sms", "email"] = "share"
    destination: str = Field(default="", max_length=160)

    @model_validator(mode="after")
    def address(self):
        if self.channel == "share" and self.destination:
            raise ValueError("Leave the address empty when using the device share sheet")
        if self.channel == "sms" and not re.fullmatch(r"\+[1-9][0-9]{6,14}", self.destination):
            raise ValueError("Use a phone number with country code, without spaces")
        if self.channel == "email" and not re.fullmatch(
            r"[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+", self.destination
        ):
            raise ValueError("Enter a valid email address")
        return self


class ShareStart(BaseModel):
    model_config = ConfigDict(extra="forbid")
    journey_id: UUID
    ticket_id: UUID | None = None
    passengers_allowed: bool = Field(default=False, strict=True)

    @model_validator(mode="after")
    def driver_sharing_only(self):
        if self.ticket_id and self.passengers_allowed:
            raise ValueError("Only a driver can share vehicle location with booked passengers")
        return self


class ShareToken(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=40, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")


class LocationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    latitude: float = Field(ge=-85, le=85, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    accuracy_m: float = Field(ge=0, le=50000, allow_inf_nan=False)
    observed_at: AwareDatetime
    sequence: int = Field(ge=1, le=2147483647, strict=True)
