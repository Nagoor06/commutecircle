from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.url import driver_url
from app.models import Journey


def offer(client, authenticated):
    data = {
        "departure": (datetime.now(UTC) + timedelta(hours=4)).isoformat(),
        "capacity": 1,
        "price_paise": 20000,
        "stops": [
            {"name": "A", "metres": 0, "minutes": 0, "lat": 16.24, "lon": 80.64},
            {"name": "B", "metres": 12000, "minutes": 20, "lat": 16.34, "lon": 80.64},
            {"name": "C", "metres": 24000, "minutes": 40, "lat": 16.44, "lon": 80.64},
        ],
        "vehicle": {
            "make": "Honda",
            "model": "City",
            "color": "Grey",
            "condition": "good",
            "purchased_on": "2020-02-02",
        },
    }
    response = client.post("/v1/journeys", json=data, headers=authenticated())
    assert response.status_code == 201
    return response.json()


def test_matched_segment_is_ordered_available_and_private(client, authenticated):
    j = offer(client, authenticated)
    url = "/v1/journeys/" + j["id"]
    rider = authenticated(subject="rider")

    def find(a, b):
        return client.post(
            "/v1/journeys/search", json={"origin": a, "destination": b}, headers=rider
        ).json()["items"]

    a = {"name": "A"}
    b = {"name": "Different label nearby", "lat": 16.345, "lon": 80.64}
    c = {"name": "C"}
    assert not find(c, b)
    assert not find({"name": "A", "lat": 0, "lon": 0}, c)
    assert find(a, b)[0]["alight"] == 1
    ticket = client.post(
        url + "/holds", json={"board": 0, "alight": 1, "checkout_id": str(uuid4())}, headers=rider
    ).json()
    assert not find(a, c)
    assert (find(b, c)[0]["board"], find(b, c)[0]["alight"]) == (1, 2)
    detail = client.get(url, headers=authenticated(subject="other")).json()
    assert detail["tickets"] == [] and detail["vehicle"]["make"] == "Honda"
    assert client.post(url + "/tickets/" + ticket["id"] + "/sandbox-pay", headers=rider).is_success
    path = url + "/tickets/" + ticket["id"] + "/cancel"
    assert client.post(path, json={"max_fee_paise": 0}, headers=rider).status_code == 409
    assert client.get(url, headers=rider).json()["tickets"][0]["state"] == "paid"
    assert (
        client.post(path, json={"max_fee_paise": 1000}, headers=rider).json()["refund_paise"]
        == 9000
    )


def test_journey_review_is_eligible_and_one_per_ticket(client, authenticated):
    j = offer(client, authenticated)
    url = "/v1/journeys/" + j["id"]
    rider = authenticated(subject="rider")
    t = client.post(
        url + "/holds", json={"board": 0, "alight": 1, "checkout_id": str(uuid4())}, headers=rider
    ).json()
    path = url + "/tickets/" + t["id"]
    assert client.post(path + "/sandbox-pay", headers=rider).is_success
    assert client.put(path + "/rating", headers=rider, json={"stars": 4}).status_code == 409
    with Session(client.app.state.engine) as session:
        session.get(Journey, j["id"]).departure = datetime.now(UTC) - timedelta(hours=2)
        session.commit()
    assert (
        client.put(path + "/rating", headers=authenticated(), json={"stars": 5}).status_code == 404
    )
    for stars in (4, 5):
        assert client.put(path + "/rating", headers=rider, json={"stars": stars}).is_success
        assert client.get(url, headers=rider).json()["driver_rating"] == {
            "average": stars,
            "count": 1,
        }


@pytest.mark.parametrize(
    "value",
    ["*", "https://user:pw@example.org", "https://example.org/some/path", "http://example.org"],
)
def test_cors_rejects_ambiguous_origins(monkeypatch, value):
    monkeypatch.setenv("WEB_ORIGINS", value)
    with pytest.raises(RuntimeError, match="exact web origins"):
        Settings.from_environment("sqlite://")


def test_hosted_postgres_scheme_keeps_escaped_password():
    assert (
        driver_url("postgres://test:a%24b@db/x?sslmode=require")
        == "postgresql+psycopg://test:a%24b@db/x?sslmode=require"
    )


def test_offer_retry_and_modified_retry(client, authenticated):
    offer_id = str(uuid4())
    data = {
        "offer_id": offer_id,
        "capacity": 1,
        "price_paise": 10000,
        "departure": (datetime.now(UTC) + timedelta(hours=3)).isoformat(),
        "stops": [
            {"name": "A", "metres": 0, "minutes": 0},
            {"name": "B", "metres": 10000, "minutes": 15},
        ],
    }
    for _ in range(2):
        assert (
            client.post("/v1/journeys", json=data, headers=authenticated()).json()["id"] == offer_id
        )
    assert (
        client.post(
            "/v1/journeys", json=data | {"capacity": 2}, headers=authenticated()
        ).status_code
        == 409
    )
    assert (
        client.post("/v1/journeys", json=data, headers=authenticated(subject="other")).status_code
        == 409
    )
    assert len(client.get("/v1/journeys/mine", headers=authenticated()).json()) == 1
