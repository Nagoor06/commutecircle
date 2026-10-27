from fastapi import APIRouter

from app.api.routes import bookings, health, pickup_points, rides

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(pickup_points.router)
api_router.include_router(rides.router)
api_router.include_router(bookings.router)
