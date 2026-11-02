from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.models import Ride


def test_vehicle_and_verified_rating(client, authenticated):
    driver = authenticated()
    rider = authenticated(subject="rider")
    vehicle = dict(
        make="Honda", model="City", color="White", purchased_on="2022-06-01", condition="good"
    )
    offer = dict(
        origin_id=1,
        destination_id=2,
        seats_available=1,
        vehicle=vehicle,
        departure_at=(datetime.now(UTC) + timedelta(hours=2)).isoformat(),
    )
    invalid = offer | {"vehicle": vehicle | {"purchased_on": "2200-01-01"}}
    assert client.post("/v1/rides", json=invalid, headers=driver).status_code == 422
    ride = client.post("/v1/rides", json=offer, headers=driver).json()["id"]
    path = f"/v1/rides/{ride}/details"
    assert client.get(path, headers=rider).json() == {
        "vehicle": vehicle,
        "driver_rating": {"count": 0, "average": None},
    }
    booking = client.post(f"/v1/rides/{ride}/requests", headers=rider).json()["id"]
    rating = f"/v1/bookings/{booking}/rating"
    assert client.put(rating, json={"stars": 5}, headers=driver).status_code == 404
    assert client.post(f"/v1/bookings/{booking}/accept", headers=driver).is_success
    assert client.put(rating, json={"stars": 5}, headers=rider).status_code == 409
    with Session(client.app.state.engine) as session:
        session.get(Ride, ride).departure_at = datetime.now(UTC) - timedelta(hours=1)
        session.commit()
    assert client.put(rating, json={"stars": 6}, headers=rider).status_code == 422
    for stars in (4, 5):
        assert client.put(rating, json={"stars": stars}, headers=rider).is_success
        assert client.get(path, headers=rider).json()["driver_rating"] == {
            "count": 1,
            "average": stars,
        }
