from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class NotificationSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email_enabled: bool
    phone_channel: Literal["none", "sms", "whatsapp"]


class VerifyPhone(BaseModel):
    model_config = ConfigDict(extra="forbid")
    phone: str = Field(pattern=r"^\+[1-9][0-9]{7,14}$")
    consent: Literal[True]


class CheckPhone(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(pattern=r"^[0-9]{4,10}$")
