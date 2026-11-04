from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy.orm import Session
from test_journey_discovery import offer

from app.models import Journey


def test_public_browsing_private_preferences_and_actions(client, authenticated):
    j = offer(client, authenticated)
    url = "/v1/journeys/" + j["id"]
    rider = authenticated(subject="rider")
    body = dict(
        pickup={"name": "A"},
        workplace={"name": "B"},
        employer="Private employer",
        public_points_confirmed=True,
    )
    assert client.put("/v1/me/commute", json=body).status_code == 401
    assert (
        client.put(
            "/v1/me/commute", json=body | {"home_address": "Secret"}, headers=rider
        ).status_code
        == 422
    )
    assert client.put("/v1/me/commute", json=body, headers=rider).is_success
    assert client.get("/v1/me/commute", headers=rider).json()["employer"] == "Private employer"
    assert client.get("/v1/me/commute", headers=authenticated()).json() is None
    data = dict(board=0, alight=1, checkout_id=str(uuid4()))
    assert client.post(url + "/holds", json=data).status_code == 401
    t = client.post(url + "/holds", json=data, headers=rider).json()
    for path, method, body in [
        (url, "get", None),
        ("/v1/journeys", "get", None),
        ("/v1/journeys/search", "post", {}),
    ]:
        response = getattr(client, method)(path, **({"json": body} if body is not None else {}))
        assert response.is_success
        assert response.headers["cache-control"] == "no-store"
        assert all(
            secret not in response.text
            for secret in [t["id"], "Private employer", "driver-a", "rider"]
        )
    assert client.post(url + "/quote", json={"board": 1, "alight": 2}).is_success
    assert client.get("/v1/journeys/mine").status_code == 401
    assert client.post(url + "/cancel").status_code == 401
    assert client.post(url + "/tickets/" + t["id"] + "/sandbox-pay").status_code == 401
    assert client.get(url, headers={"Authorization": "Bearer invalid"}).status_code == 401
    assert client.delete("/v1/me/commute", headers=rider).is_success
    assert client.get("/v1/me/commute", headers=rider).json() is None


def test_office_ranking_segment_price_filters_and_nearby_dropoffs(client, authenticated):
    first = offer(client, authenticated)
    second = offer(client, authenticated)
    with Session(client.app.state.engine) as session:
        j = session.get(Journey, first["id"])
        j.stops = [{**s, "name": "Other " + s["name"], "lat": s["lat"] + 2} for s in j.stops]
        j.departure = datetime.now(UTC) + timedelta(hours=2)
        session.get(Journey, second["id"]).preferences = {"quiet": True, "air_conditioned": True}
        session.commit()
    rider = authenticated(subject="rider")
    assert client.put(
        "/v1/me/commute",
        json={"pickup": {"name": "A"}, "workplace": {"name": "B"}, "public_points_confirmed": True},
        headers=rider,
    ).is_success

    def search(q, headers=None):
        response = client.post("/v1/journeys/search", json=q, headers=headers or {})
        assert response.is_success, response.text
        return response.json()["items"]

    ranked = search({"prefer_commute": True}, rider)
    assert ranked[0]["journey"]["id"] == second["id"]
    assert ranked[0]["match"]["commute"] is True
    assert ranked[0]["alight"] == 1 and ranked[0]["match"]["fare_paise"] == 10000
    assert search({"sort": "departure"})[0]["journey"]["id"] == first["id"]
    q = {"origin": {"name": "A"}, "destination": {"name": "B"}}
    assert not search(q | {"max_fare_paise": 9999})
    assert search(q | {"max_fare_paise": 10000, "quiet": True, "air_conditioned": True})
    assert not search(q | {"min_seats": 2})
    assert not search(q | {"min_rating": 4})
    farther = q | {"destination": {"name": "Beyond B", "lat": 16.36, "lon": 80.64}}
    assert not search(farther | {"destination_radius_m": 250})
    match = search(farther | {"destination_radius_m": 5000, "sort": "arrival"})[0]
    assert match["alight"] == 1 and match["match"]["dropoff_distance_m"] > 2000
    assert client.post("/v1/journeys/search", json={"radius_m": 100000}).status_code == 422
