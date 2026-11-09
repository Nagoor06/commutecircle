# Import models here so Alembic discovers their metadata.
from app.models.pickup_point import PickupPoint
from app.models.ride import Ride
from app.models.trip_share import TripShare, TrustedContact

__all__ = ["PickupPoint", "Ride", "Booking"]

from app.models.booking import Booking
from app.models.chat import ChatBlock, ChatRead, Message
from app.models.commute import Commute
from app.models.journey import Journey, PaymentEntry, Ticket
from app.models.notification import Notification, NotificationPreference, VerificationLimit

__all__ += ["Journey", "Ticket", "PaymentEntry", "Commute", "ChatBlock", "Message"]
__all__ += ["TripShare", "TrustedContact"]
__all__ += ["ChatRead"]

__all__ += ["Notification", "NotificationPreference", "VerificationLimit"]

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
