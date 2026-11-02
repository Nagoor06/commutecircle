from fastapi import APIRouter

from app.api.routes import (
    bookings,
    health,
    meeting_notes,
    pickup_points,
    ride_details,
    ride_help,
    rides,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(pickup_points.router)
api_router.include_router(rides.router)
api_router.include_router(bookings.router)
api_router.include_router(ride_details.router)

api_router.include_router(meeting_notes.router)

api_router.include_router(ride_help.router)
