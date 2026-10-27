from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError

from app.models import PickupPoint

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
def live():
    return {"status": "ok"}


@router.get("/ready")
def ready(request: Request):
    try:
        with request.app.state.engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            connection.execute(select(PickupPoint.id).limit(1))
    except SQLAlchemyError:
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    return {"status": "ready"}
