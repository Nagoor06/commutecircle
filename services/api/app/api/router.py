from fastapi import APIRouter

from app.api.routes import (
    bookings,
    chat,
    commute,
    health,
    journeys,
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

api_router.include_router(journeys.router)
api_router.include_router(commute.router)
api_router.include_router(chat.router)
