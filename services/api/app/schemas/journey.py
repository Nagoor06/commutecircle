from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class Stop(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=80)
    metres: int = Field(ge=0, le=3000000, strict=True)
    minutes: int = Field(ge=0, le=2880, strict=True)


class Offer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stops: list[Stop] = Field(min_length=2, max_length=16)
    departure: AwareDatetime
    price_paise: int = Field(ge=100, le=10000000, strict=True)
    capacity: int = Field(ge=1, le=8, strict=True)

    @model_validator(mode="after")
    def route(self):
        if self.stops[0].metres or self.stops[0].minutes:
            raise ValueError("First stop must start at zero distance and time")
        for a, b in zip(self.stops, self.stops[1:], strict=False):
            if a.metres >= b.metres or a.minutes >= b.minutes:
                raise ValueError("Distance and time must increase at each stop")
        return self


class Segment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    board: int = Field(ge=0, strict=True)
    alight: int = Field(gt=0, strict=True)


class Hold(Segment):
    checkout_id: UUID


class ExitStop(BaseModel):
    stop: int = Field(gt=0, strict=True)
