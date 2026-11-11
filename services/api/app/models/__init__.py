"""Load all mapped models so Alembic can see V1 and V2 metadata."""

from app.models.booking import Booking
from app.models.chat import ChatBlock, ChatRead, Message
from app.models.commute import Commute
from app.models.journey import Journey, PaymentEntry, Ticket
from app.models.notification import Notification, NotificationPreference, VerificationLimit
from app.models.pickup_point import PickupPoint
from app.models.ride import Ride
from app.models.trip_share import TripShare, TrustedContact
from app.models.v2 import (
    BoardingChallenge,
    CircleInvitation,
    CircleMember,
    CommuteCircle,
    CommuterProfile,
    DriverVerification,
    RecurringException,
    RecurringRide,
    SafetyCaseEvent,
    SafetyReport,
    TripEvent,
    VerifiedVehicle,
)

__all__ = [
    "Booking",
    "BoardingChallenge",
    "ChatBlock",
    "ChatRead",
    "CircleInvitation",
    "CircleMember",
    "Commute",
    "CommuteCircle",
    "CommuterProfile",
    "DriverVerification",
    "Journey",
    "Message",
    "Notification",
    "NotificationPreference",
    "PaymentEntry",
    "PickupPoint",
    "RecurringException",
    "RecurringRide",
    "Ride",
    "SafetyCaseEvent",
    "SafetyReport",
    "Ticket",
    "TripEvent",
    "TripShare",
    "TrustedContact",
    "VerificationLimit",
    "VerifiedVehicle",
]
