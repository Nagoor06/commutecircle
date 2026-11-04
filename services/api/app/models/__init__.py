# Import models here so Alembic discovers their metadata.
from app.models.pickup_point import PickupPoint
from app.models.ride import Ride

__all__ = ["PickupPoint", "Ride", "Booking"]

from app.models.booking import Booking
from app.models.chat import ChatBlock, Message
from app.models.commute import Commute
from app.models.journey import Journey, PaymentEntry, Ticket

__all__ += ["Journey", "Ticket", "PaymentEntry", "Commute", "ChatBlock", "Message"]
