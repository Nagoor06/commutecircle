from fastapi import APIRouter

from app.api.routes import (
    bookings,
    chat,
    commute,
    conversations,
    earlier_trips,
    health,
    journeys,
    meeting_notes,
    notifications,
    pickup_points,
    ride_details,
    ride_help,
    rides,
    trip_sharing,
    v2_approval,
    v2_boarding,
    v2_circles,
    v2_recurring,
    v2_safety,
    v2_verification,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(pickup_points.router)
api_router.include_router(rides.router, deprecated=True)
api_router.include_router(bookings.router, deprecated=True)
api_router.include_router(ride_details.router, deprecated=True)

api_router.include_router(meeting_notes.router)

api_router.include_router(ride_help.router)

api_router.include_router(journeys.router)
api_router.include_router(earlier_trips.router)
api_router.include_router(commute.router)
api_router.include_router(chat.router)
api_router.include_router(conversations.router)
api_router.include_router(trip_sharing.router)

api_router.include_router(notifications.router)

api_router.include_router(v2_verification.router)
api_router.include_router(v2_approval.router)
api_router.include_router(v2_boarding.router)
api_router.include_router(v2_safety.router)
api_router.include_router(v2_recurring.router)
api_router.include_router(v2_circles.router)
