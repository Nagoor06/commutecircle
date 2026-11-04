import json
import os
from threading import BoundedSemaphore
from typing import Literal
from urllib.error import URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.auth.dependencies import RideReader

router = APIRouter(prefix="/v1", tags=["ride help"])
# Local inference has one worker. Reject overlapping requests instead of building a queue.
_slot = BoundedSemaphore(1)


class Question(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    question: str = Field(min_length=1, max_length=300)


class Citation(BaseModel):
    title: str
    url: str = Field(
        pattern=r"^https://github\.com/Nagoor06/commutecircle/blob/main/services/ride-help/guide\.md#[a-z-]+$"
    )


class Answer(BaseModel):
    status: Literal["answered", "no_evidence", "private_input"]
    answer: str
    sources: list[Citation]


@router.post("/help/ask", response_model=Answer)
def ask(data: Question, principal: RideReader):
    url = os.getenv("RIDE_HELP_URL")
    if not url:
        raise HTTPException(503, "Start the optional ride-help services first.")
    if not _slot.acquire(blocking=False):
        raise HTTPException(429, "Ride help is busy. Try again shortly.")
    try:
        request = Request(
            url, data=data.model_dump_json().encode(), headers={"Content-Type": "application/json"}
        )
        with urlopen(request, timeout=140) as response:
            return Answer.model_validate(json.load(response))
    except (URLError, OSError, ValueError, ValidationError) as exc:
        raise HTTPException(503, "Ride help is unavailable. Please use the rider guide.") from exc
    finally:
        _slot.release()
