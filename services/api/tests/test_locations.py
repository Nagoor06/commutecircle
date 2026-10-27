import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import PickupPoint
from app.services.locations import distance_m


def test_manual_search(client):
    assert len(client.get("/v1/pickup-points?city=TestCity&q=point%20a").json()) == 1
    assert client.get("/v1/pickup-points?city=TestCity&q=missing").json() == []
    # Wildcards are literal user input, not unrestricted SQL pattern matches.
    assert client.get("/v1/pickup-points", params={"city": "TestCity", "q": "%"}).json() == []


def test_nearby_is_read_only_and_logs_no_coordinates(client, caplog):
    with caplog.at_level("INFO", logger="commutecircle.requests"):
        response = client.post(
            "/v1/pickup-points/nearby",
            json={"latitude": 12.00001, "longitude": 77, "radius_m": 500},
        )
    assert response.status_code == 200
    assert [p["id"] for p in response.json()] == [1]
    assert response.json()[0]["distance_m"] < 5
    with Session(client.app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(PickupPoint)) == 2
    assert all(
        "12.00001" not in record.message
        for record in caplog.records
        if record.name == "commutecircle.requests"
    )
    assert (
        client.post("/v1/pickup-points/nearby", json={"latitude": 0, "longitude": 0}).json() == []
    )


@pytest.mark.parametrize(
    "body",
    [
        {"latitude": 91, "longitude": 0},
        {"latitude": 0, "longitude": -181},
        {"latitude": 0, "longitude": 0, "radius_m": 100000},
        {"latitude": 0, "longitude": 0, "limit": 100},
    ],
)
def test_location_bounds(client, body):
    assert client.post("/v1/pickup-points/nearby", json=body).status_code == 422


@pytest.mark.parametrize("lng", [179.999, -179.999])
def test_dateline(client, lng):
    with Session(client.app.state.engine) as session, session.begin():
        session.add(PickupPoint(name="Dateline", city="Test", latitude=0, longitude=-lng))
    response = client.post(
        "/v1/pickup-points/nearby", json={"latitude": 0, "longitude": lng, "radius_m": 1000}
    )
    assert response.json()[0]["name"] == "Dateline"


def test_polar_distance(client):
    with Session(client.app.state.engine) as session, session.begin():
        session.add(PickupPoint(name="Pole", city="Test", latitude=89.9999, longitude=90))
    assert (
        client.post("/v1/pickup-points/nearby", json={"latitude": 90, "longitude": 0}).json()[0][
            "name"
        ]
        == "Pole"
    )
    assert distance_m(0, 0, 0, 0) == 0
    assert 111000 < distance_m(0, 0, 0, 1) < 112000
