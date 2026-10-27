from fastapi import APIRouter

from app.api.routes import health, pickup_points

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(pickup_points.router)
