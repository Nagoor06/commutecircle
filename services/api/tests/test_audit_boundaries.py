"""Calendar boundaries and verification enforcement across the compatibility API."""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest


@pytest.mark.parametrize("zone", ["UTC", "Asia/Kolkata", "America/New_York"])
@pytest.mark.parametrize("board", [0, 1])
def test_day_search_includes_midnight_pickup_and_excludes_next_midnight(
    client, authenticated, zone, board
):
    start = (datetime.now(ZoneInfo(zone)) + timedelta(days=3)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    end = start + timedelta(days=1)
    stops = [
        {"name": "Station A", "metres": 0, "minutes": 0},
        {"name": "Station B", "metres": 10000, "minutes": 20},
        {"name": "Station C", "metres": 20000, "minutes": 40},
    ]
    ids = []
    for pickup in [start, end]:
        result = client.post(
            "/v1/journeys",
            headers=authenticated(),
            json={
                "stops": stops,
                "departure": (pickup - timedelta(minutes=stops[board]["minutes"])).isoformat(),
                "price_paise": 10000,
                "capacity": 1,
            },
        )
        assert result.status_code == 201, result.text
        ids.append(result.json()["id"])
    found = client.post(
        "/v1/journeys/search",
        json={
            "after": start.isoformat(),
            "before": end.isoformat(),
            "origin": {"name": stops[board]["name"]},
            "destination": {"name": "Station C"},
        },
    )
    assert found.status_code == 200
    assert [r["journey"]["id"] for r in found.json()["items"]] == ids[:1]


def test_required_verification_closes_deprecated_offer_creation_only(
    client, authenticated, monkeypatch
):
    data = {
        "origin_id": 1,
        "destination_id": 2,
        "departure_at": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
        "seats_available": 1,
    }
    owner = authenticated()
    existing = client.post("/v1/rides", headers=owner, json=data)
    assert existing.status_code == 201
    monkeypatch.setenv("V2_REQUIRE_DRIVER_VERIFICATION", "true")
    blocked = client.post("/v1/rides", headers=owner, json=data)
    assert blocked.status_code == 409
    assert "approved vehicle" in blocked.json()["detail"]
    history = client.get("/v1/rides/mine", headers=owner).json()
    assert [ride["id"] for ride in history] == [existing.json()["id"]]
    assert client.post(f"/v1/rides/{existing.json()['id']}/cancel", headers=owner).is_success
