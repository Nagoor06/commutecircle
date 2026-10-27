from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.auth.principal import Principal
from app.models import Ride
from app.repositories import bookings as repository
from app.services import bookings as service


def request(client, authenticated, ride, subject="rider-a"):
    response = client.post(f"/v1/rides/{ride}/requests", headers=authenticated(subject=subject))
    assert response.status_code == 200
    return response.json()


def seats(client, ride):
    with Session(client.app.state.engine) as session:
        return session.get(Ride, ride).seats_available


def test_last_seat_and_retry_safety(client, authenticated, offered_ride):
    first = request(client, authenticated, offered_ride)
    second = request(client, authenticated, offered_ride, "rider-b")
    assert request(client, authenticated, offered_ride) == first
    assert seats(client, offered_ride) == 1
    assert set(first) == {"id", "ride_id", "status"}
    driver = authenticated()
    url = f"/v1/bookings/{first['id']}/accept"
    assert client.post(url, headers=driver).json()["status"] == "accepted"
    assert client.post(url, headers=driver).status_code == 200
    assert seats(client, offered_ride) == 0
    assert client.post(f"/v1/bookings/{second['id']}/accept", headers=driver).status_code == 409
    assert (
        client.post(
            f"/v1/rides/{offered_ride}/requests", headers=authenticated(subject="late-rider")
        ).status_code
        == 409
    )
    assert client.get("/v1/rides?origin_id=1&destination_id=2", headers=driver).json() == []
    cancel = f"/v1/bookings/{first['id']}/cancel"
    for _ in range(2):
        assert (
            client.post(cancel, headers=authenticated(subject="rider-a")).json()["status"]
            == "cancelled"
        )
    assert seats(client, offered_ride) == 1
    assert client.post(f"/v1/bookings/{second['id']}/accept", headers=driver).status_code == 200
    assert seats(client, offered_ride) == 0


def test_ownership_and_listing(client, authenticated, offered_ride):
    booking = request(client, authenticated, offered_ride)
    assert (
        client.post(f"/v1/rides/{offered_ride}/requests", headers=authenticated()).status_code
        == 409
    )
    assert client.get("/v1/bookings/mine", headers=authenticated(subject="rider-a")).json() == [
        booking
    ]
    assert client.get("/v1/bookings/mine", headers=authenticated(subject="other")).json() == []
    assert client.get(f"/v1/rides/{offered_ride}/requests", headers=authenticated()).json() == [
        booking
    ]
    assert (
        client.get(
            f"/v1/rides/{offered_ride}/requests", headers=authenticated(subject="rider-a")
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/v1/bookings/{booking['id']}/accept", headers=authenticated(subject="rider-a")
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/v1/bookings/{booking['id']}/cancel", headers=authenticated(subject="other")
        ).status_code
        == 404
    )
    assert client.post(f"/v1/bookings/{booking['id']}/cancel").status_code == 401
    assert (
        client.post(
            f"/v1/bookings/{booking['id']}/cancel", headers=authenticated(scope="rides:read")
        ).status_code
        == 403
    )
    assert client.get("/v1/bookings/mine?limit=101", headers=authenticated()).status_code == 422


def test_reject_and_terminal_requests(client, authenticated, offered_ride):
    booking = request(client, authenticated, offered_ride)
    url = f"/v1/bookings/{booking['id']}"
    for _ in range(2):
        assert client.post(url + "/reject", headers=authenticated()).json()["status"] == "rejected"
    assert request(client, authenticated, offered_ride)["status"] == "rejected"
    assert client.post(url + "/accept", headers=authenticated()).status_code == 409
    assert client.post(url + "/cancel", headers=authenticated(subject="rider-a")).status_code == 409
    assert seats(client, offered_ride) == 1


def test_pending_cancellation_and_driver_cancellation(client, authenticated, offered_ride):
    booking = request(client, authenticated, offered_ride)
    assert (
        client.post(f"/v1/bookings/{booking['id']}/cancel", headers=authenticated()).status_code
        == 200
    )
    assert seats(client, offered_ride) == 1
    assert (
        client.post(f"/v1/bookings/{booking['id']}/accept", headers=authenticated()).status_code
        == 409
    )


def test_missing_and_departed(client, authenticated, offered_ride):
    unknown = str(uuid4())
    headers = authenticated(subject="rider-a")
    assert client.post(f"/v1/rides/{unknown}/requests", headers=headers).status_code == 404
    assert client.post(f"/v1/bookings/{unknown}/accept", headers=authenticated()).status_code == 404
    booking = request(client, authenticated, offered_ride)
    with Session(client.app.state.engine) as session, session.begin():
        session.get(Ride, offered_ride).departure_at = datetime.now(UTC) - timedelta(hours=1)
    assert (
        client.post(f"/v1/bookings/{booking['id']}/accept", headers=authenticated()).status_code
        == 409
    )
    assert (
        client.post(
            f"/v1/rides/{offered_ride}/requests", headers=authenticated(subject="other")
        ).status_code
        == 409
    )


def test_failure_after_allocation_rolls_back(client, authenticated, offered_ride, monkeypatch):
    booking = request(client, authenticated, offered_ride)
    original = repository.allocate_seat

    def fail_after_update(session, ride_id):
        assert original(session, ride_id)
        raise service.BookingError(409, "Injected downstream failure")

    monkeypatch.setattr(repository, "allocate_seat", fail_after_update)
    with Session(client.app.state.engine) as session, pytest.raises(service.BookingError):
        service.transition(
            session,
            Principal("https://identity.example", "driver-a", frozenset()),
            booking["id"],
            "accepted",
        )
    assert seats(client, offered_ride) == 1
    assert (
        client.get("/v1/bookings/mine", headers=authenticated(subject="rider-a")).json()[0][
            "status"
        ]
        == "pending"
    )
