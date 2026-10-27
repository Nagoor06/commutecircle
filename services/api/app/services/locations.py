"""Suggest existing public points; never persist the caller's coordinates."""

from math import asin, cos, degrees, radians, sin, sqrt

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import PickupPoint
from app.schemas.location import NearbyPoint, NearbyQuery

EARTH_RADIUS_M = 6371008.8


def distance_m(lat1, lon1, lat2, lon2):
    lat1, lat2, dlon = radians(lat1), radians(lat2), radians(lon2 - lon1)
    value = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * asin(sqrt(min(1.0, max(0.0, value))))


def nearby_points(session: Session, query: NearbyQuery):
    angular = query.radius_m / EARTH_RADIUS_M
    lat_delta = degrees(angular)
    statement = select(PickupPoint).where(
        PickupPoint.latitude.between(
            max(-90, query.latitude - lat_delta), min(90, query.latitude + lat_delta)
        )
    )
    # Spherical bounding box, including date-line crossings and polar caps.
    if abs(query.latitude) + lat_delta < 90:
        lon_delta = degrees(asin(min(1.0, sin(angular) / cos(radians(query.latitude)))))
        low, high = query.longitude - lon_delta, query.longitude + lon_delta
        if low < -180:
            statement = statement.where(
                or_(PickupPoint.longitude >= low + 360, PickupPoint.longitude <= high)
            )
        elif high > 180:
            statement = statement.where(
                or_(PickupPoint.longitude >= low, PickupPoint.longitude <= high - 360)
            )
        else:
            statement = statement.where(PickupPoint.longitude.between(low, high))
    matches = []
    for point in session.scalars(statement):
        distance = distance_m(query.latitude, query.longitude, point.latitude, point.longitude)
        if distance <= query.radius_m:
            matches.append((distance, point.id, point))
    matches.sort(key=lambda row: (row[0], row[1]))
    return [
        NearbyPoint(
            **{field: getattr(point, field) for field in PickupPointOutFields},
            distance_m=round(distance),
        )
        for distance, _, point in matches[: query.limit]
    ]


PickupPointOutFields = ("id", "name", "city", "latitude", "longitude")
