from datetime import UTC, datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import Session

from app.models import Ride


@pytest.fixture
def ride_data():
    return {
        "origin_id": 1,
        "destination_id": 2,
        "departure_at": (datetime.now(UTC) + timedelta(hours=2)).isoformat(),
        "seats_available": 3,
    }


def test_create_search_and_owner_privacy(client, authenticated, ride_data):
    result = client.post("/v1/rides", json=ride_data, headers=authenticated())
    assert result.status_code == 201
    ride = result.json()
    assert set(ride) == {"id", "origin_id", "destination_id", "departure_at", "seats_available"}
    assert ride["departure_at"].endswith("Z")
    assert client.get("/v1/rides/mine", headers=authenticated()).json() == [ride]
    assert client.get("/v1/rides/mine", headers=authenticated(subject="other-driver")).json() == []
    response = client.get(
        "/v1/rides",
        params={"origin_id": 1, "destination_id": 2},
        headers=authenticated(subject="rider"),
    )
    assert response.json() == [ride]
    with Session(client.app.state.engine) as session:
        stored = session.get(Ride, ride["id"])
        assert stored.driver_subject == "driver-a"
        assert stored.driver_issuer == "https://identity.example"


@pytest.mark.parametrize(
    "change",
    [
        {"origin_id": 2},
        {"origin_id": 999},
        {"destination_id": 999},
        {"seats_available": 0},
        {"seats_available": 9},
        {"seats_available": True},
        {"departure_at": "2020-01-01T10:00:00Z"},
        {"departure_at": "2099-01-01T10:00:00"},
        {"driver_subject": "victim"},
        {"home_address": "private"},
    ],
)
def test_invalid_ride_does_not_write(client, authenticated, ride_data, change):
    ride_data.update(change)
    assert client.post("/v1/rides", json=ride_data, headers=authenticated()).status_code == 422
    assert client.get("/v1/rides/mine", headers=authenticated()).json() == []


def test_write_permission_required(client, authenticated, ride_data):
    assert (
        client.post(
            "/v1/rides", json=ride_data, headers=authenticated(scope="rides:read")
        ).status_code
        == 403
    )
    assert client.post("/v1/rides", json=ride_data).status_code == 401


def test_filters_pagination_and_time_window(client, authenticated, ride_data):
    headers = authenticated()
    assert client.post("/v1/rides", json=ride_data, headers=headers).status_code == 201
    base = {"origin_id": 1, "destination_id": 2}
    for changes in [
        {"seats": 4},
        {"offset": 1},
        {"origin_id": 2, "destination_id": 1},
        {"after": (datetime.now(UTC) + timedelta(days=1)).isoformat()},
    ]:
        assert client.get("/v1/rides", params=base | changes, headers=headers).json() == []
    for changes in [
        {"limit": 101},
        {"offset": -1},
        {"destination_id": 1},
        {"after": "2099-01-01T10:00:00"},
        {"before": "2020-01-01T00:00:00Z"},
        {"before": "2099-01-01T00:00:00Z"},
    ]:
        assert client.get("/v1/rides", params=base | changes, headers=headers).status_code == 422


def test_non_utc_departure_normalized(client, authenticated, ride_data):
    instant = datetime.now(UTC) + timedelta(hours=3)
    ride_data["departure_at"] = instant.astimezone(
        timezone(timedelta(hours=5, minutes=30))
    ).isoformat()
    response = client.post("/v1/rides", json=ride_data, headers=authenticated())
    assert response.status_code == 201
    assert datetime.fromisoformat(response.json()["departure_at"]) == instant


@pytest.mark.parametrize(
    "values", [{"origin_id": 999}, {"seats_available": -1}, {"destination_id": 1}]
)
def test_database_constraints(client, ride_data, values):
    from sqlalchemy.exc import IntegrityError

    ride_data.update(values)
    ride_data["departure_at"] = datetime.fromisoformat(ride_data["departure_at"])
    with Session(client.app.state.engine) as session:
        session.add(
            Ride(
                driver_issuer="https://identity.example",
                driver_subject="driver",
                seats_capacity=3,
                **ride_data,
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()


def test_request_logs_exclude_credentials_and_query(client, authenticated, caplog):
    headers = authenticated()
    with caplog.at_level("INFO", logger="commutecircle.requests"):
        response = client.get("/v1/rides/mine?private_location=never-log-this", headers=headers)
    assert response.status_code == 200
    messages = [
        record.message for record in caplog.records if record.name == "commutecircle.requests"
    ]
    assert messages
    assert all(
        "never-log-this" not in message and headers["Authorization"] not in message
        for message in messages
    )
