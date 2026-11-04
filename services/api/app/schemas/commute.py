from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.journey import Place


class CommutePreferences(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    pickup: Place
    workplace: Place
    employer: str = Field(default="", max_length=80)
    public_points_confirmed: Literal[True]

    @model_validator(mode="after")
    def distinct(self):
        if self.pickup == self.workplace:
            raise ValueError("Choose different pickup and workplace meeting points")
        return self
