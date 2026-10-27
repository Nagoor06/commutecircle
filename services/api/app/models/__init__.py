# Import models here so Alembic discovers their metadata.
from app.models.pickup_point import PickupPoint
from app.models.ride import Ride

__all__ = ["PickupPoint", "Ride"]
