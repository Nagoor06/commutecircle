from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.auth.dependencies import RideReader
from app.services.meeting_notes import AssistantBusy, AssistantUnavailable, translate

router = APIRouter(prefix="/v1/meeting-notes", tags=["meeting notes"])


class TranslationRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    landmark: str = Field(min_length=1, max_length=120)
    language: Literal["English", "Telugu", "Hindi", "Tamil", "Kannada"]


@router.post("/translate")
def translate_note(data: TranslationRequest, principal: RideReader):
    try:
        return {"translation": translate(data.landmark, data.language)}
    except AssistantBusy as exc:
        raise HTTPException(429, "Translation limit reached. Try again in a minute.") from exc
    except AssistantUnavailable as exc:
        raise HTTPException(503, "Translation unavailable. Use the original meeting card.") from exc
