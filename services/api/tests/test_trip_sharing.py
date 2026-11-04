from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session
from test_journeys import listing

from app.models import Journey, TripShare
from app.services import trip_sharing


def trip(client, authenticated, paid=True):
    base = listing(client, authenticated)
    jid = base.rsplit("/", 1)[-1]
    with Session(client.app.state.engine) as session, session.begin():
        j = session.get(Journey, jid)
        j.departure = datetime.now(UTC) + timedelta(minutes=20)
        j.last_stop_at = j.departure + timedelta(hours=1)
    rider = authenticated(subject="rider")
    response = client.post(
        base + "/holds", headers=rider, json={"board": 0, "alight": 2, "checkout_id": str(uuid4())}
    )
    response.raise_for_status()
    tid = response.json()["id"]
    if paid:
        client.post(base + "/tickets/" + tid + "/sandbox-pay", headers=rider).raise_for_status()
    return jid, tid, rider


def start(client, jid, tid, headers):
    response = client.post(
        "/v1/trip-shares",
        headers=headers,
        json={"journey_id": jid, **({"ticket_id": tid} if tid else {})},
    )
    response.raise_for_status()
    return response.json()


def point(sequence=1):
    return dict(
        latitude=16.3,
        longitude=80.6,
        accuracy_m=12,
        observed_at=datetime.now(UTC).isoformat(),
        sequence=sequence,
    )


def view(client, share):
    return client.post("/v1/trip-shares/view", json={"token": share["token"]})


def locate(client, share, rider, **changes):
    return client.put(
        "/v1/trip-shares/" + share["id"] + "/location", headers=rider, json=point() | changes
    )


def test_contacts_are_private_upserted_and_limited_to_five_slots(client, authenticated):
    path = "/v1/me/trusted-contacts"
    rider = authenticated(subject="rider")
    data = {"name": "My trusted person", "channel": "share"}
    assert client.get(path).status_code == 401
    assert client.put(path + "/1", json=data).status_code == 401
    for slot in range(1, 6):
        assert client.put(path + f"/{slot}", json=data, headers=rider).is_success
    assert client.put(path + "/6", json=data, headers=rider).status_code == 422
    assert client.put(path + "/0", json=data, headers=rider).status_code == 422
    assert client.put(path + "/1", json=data | {"name": "Updated"}, headers=rider).is_success
    response = client.get(path, headers=rider)
    assert response.headers["cache-control"] == "no-store"
    assert len(response.json()) == 5 and response.json()[0]["name"] == "Updated"
    assert client.get(path, headers=authenticated()).json() == []
    client.delete(path + "/1", headers=authenticated()).raise_for_status()
    assert len(client.get(path, headers=rider).json()) == 5
    client.delete(path + "/1", headers=rider).raise_for_status()
    assert len(client.get(path, headers=rider).json()) == 4


@pytest.mark.parametrize(
    ("channel", "destination", "status"),
    [
        ("share", "", 200),
        ("share", "extra address", 422),
        ("sms", "+919876543210", 200),
        ("sms", "9876543210", 422),
        ("sms", "+91 9876543210", 422),
        ("email", "contact@example.com", 200),
        ("email", "not an address", 422),
        ("email", "a@example.com\r\nBcc:b@evil.test", 422),
    ],
)
def test_contact_address_validation(client, authenticated, channel, destination, status):
    response = client.put(
        "/v1/me/trusted-contacts/1",
        headers=authenticated(),
        json={"name": "Trusted person", "channel": channel, "destination": destination},
    )
    assert response.status_code == status


def test_shared_link_is_capability_only_and_hides_identity(client, authenticated):
    jid, tid, rider = trip(client, authenticated)
    share = start(client, jid, tid, rider)
    assert view(client, share).json()["state"] == "waiting"
    assert locate(client, share, rider).is_success
    response = view(client, share)
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["state"] == "live"
    assert response.json()["position"]["latitude"] == 16.3
    assert set(response.json()) == {
        "origin",
        "destination",
        "expires_at",
        "updated_at",
        "state",
        "position",
    }
    assert all(
        secret not in response.text
        for secret in ["rider", "driver-a", "identity.example", tid, jid]
    )
    assert view(client, {"token": "x" * 43}).status_code == 410
    with Session(client.app.state.engine) as session:
        row = session.get(TripShare, share["id"])
        assert row.token_hash == trip_sharing.digest(share["token"])
        assert share["token"] not in vars(row).values()
    assert client.get("/v1/trip-shares/view?token=" + share["token"]).status_code == 405


def test_only_the_booked_traveller_or_driver_can_share(client, authenticated):
    jid, tid, rider = trip(client, authenticated, paid=False)
    data = {"journey_id": jid, "ticket_id": tid}
    assert client.post("/v1/trip-shares", json=data).status_code == 401
    assert client.post("/v1/trip-shares", json=data, headers=rider).status_code == 410
    assert client.post("/v1/trip-shares", json=data, headers=authenticated()).status_code == 404
    assert (
        client.post("/v1/trip-shares", json={"journey_id": jid}, headers=rider).status_code == 404
    )
    driver_share = start(client, jid, None, authenticated())
    assert locate(client, driver_share, rider).status_code == 404
    assert (
        client.post("/v1/trip-shares/" + driver_share["id"] + "/stop", headers=rider).status_code
        == 404
    )
    base = "/v1/journeys/" + jid
    client.post(base + "/tickets/" + tid + "/sandbox-pay", headers=rider).raise_for_status()
    with Session(client.app.state.engine) as session, session.begin():
        session.get(Journey, jid).departure = datetime.now(UTC) + timedelta(hours=4)
    assert client.post("/v1/trip-shares", json=data, headers=rider).status_code == 409


def test_out_of_order_old_and_invalid_fixes_do_not_replace_latest(client, authenticated):
    jid, tid, rider = trip(client, authenticated)
    share = start(client, jid, tid, rider)
    assert locate(client, share, rider, sequence=3).json()["accepted"]
    assert not locate(client, share, rider, sequence=2, latitude=20).json()["accepted"]
    earlier = (datetime.now(UTC) - timedelta(seconds=30)).isoformat()
    assert not locate(client, share, rider, sequence=4, observed_at=earlier).json()["accepted"]
    for change in [
        {"latitude": 100},
        {"accuracy_m": -1},
        {"sequence": 1.1},
        {"observed_at": "2020-01-01T00:00:00Z"},
        {"observed_at": (datetime.now(UTC) + timedelta(minutes=1)).isoformat()},
        {"observed_at": "2026-11-04T08:00:00"},
    ]:
        assert locate(client, share, rider, **change).status_code == 422
    assert view(client, share).json()["position"]["latitude"] == 16.3


def test_stale_expired_stopped_and_replaced_links(client, authenticated):
    jid, tid, rider = trip(client, authenticated)
    share = start(client, jid, tid, rider)
    locate(client, share, rider).raise_for_status()
    with Session(client.app.state.engine) as session, session.begin():
        session.get(TripShare, share["id"]).updated_at = datetime.now(UTC) - timedelta(seconds=70)
    assert view(client, share).json()["state"] == "stale"
    with Session(client.app.state.engine) as session, session.begin():
        session.get(TripShare, share["id"]).updated_at = datetime.now(UTC) - timedelta(minutes=6)
    assert view(client, share).status_code == 410
    assert locate(client, share, rider, sequence=2).status_code == 410
    trip_sharing.purge_locations(client.app.state.engine)
    with Session(client.app.state.engine) as session:
        old = session.get(TripShare, share["id"])
        assert old.revoked and old.latitude is None and old.observed_at is None
    next_share = start(client, jid, tid, rider)
    replacement = start(client, jid, tid, rider)
    assert view(client, next_share).status_code == 410
    assert view(client, replacement).is_success
    locate(client, replacement, rider).raise_for_status()
    for _ in range(2):
        assert client.post(
            "/v1/trip-shares/" + replacement["id"] + "/stop", headers=rider
        ).is_success
    assert view(client, replacement).status_code == 410
    with Session(client.app.state.engine) as session:
        assert session.get(TripShare, replacement["id"]).latitude is None


@pytest.mark.parametrize("action", ["rider_cancel", "driver_cancel", "exit"])
def test_cancellation_and_exit_revoke_links_and_erase_location(client, authenticated, action):
    jid, tid, rider = trip(client, authenticated)
    share = start(client, jid, tid, rider)
    locate(client, share, rider).raise_for_status()
    base = "/v1/journeys/" + jid
    if action == "rider_cancel":
        response = client.post(base + "/tickets/" + tid + "/cancel", headers=rider)
    elif action == "driver_cancel":
        response = client.post(base + "/cancel", headers=authenticated())
    else:
        with Session(client.app.state.engine) as session, session.begin():
            session.get(Journey, jid).departure = datetime.now(UTC) - timedelta(minutes=10)
        response = client.post(
            base + "/tickets/" + tid + "/exit", headers=authenticated(), json={"stop": 1}
        )
    response.raise_for_status()
    assert view(client, share).status_code == 410
    assert locate(client, share, rider, sequence=2).status_code == 410
    with Session(client.app.state.engine) as session:
        row = session.get(TripShare, share["id"])
        assert row.revoked and row.latitude is None


def test_stop_racing_location_cannot_restore_access(client, authenticated):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    from fastapi import HTTPException

    from app.auth.principal import Principal
    from app.schemas.trip_share import LocationUpdate

    engine = client.app.state.engine
    if engine.dialect.name != "postgresql":
        pytest.skip("requires real PostgreSQL row locks")
    jid, tid, rider = trip(client, authenticated)
    share = start(client, jid, tid, rider)
    barrier = Barrier(2)
    principal = Principal("https://identity.example", "rider", frozenset())

    def run(action):
        with Session(engine) as session:
            barrier.wait(timeout=10)
            try:
                if action == "stop":
                    trip_sharing.stop(session, share["id"], principal)
                else:
                    trip_sharing.locate(session, share["id"], principal, LocationUpdate(**point()))
            except HTTPException as exc:
                assert action == "locate" and exc.status_code == 410

    with ThreadPoolExecutor(2) as pool:
        list(pool.map(run, ["stop", "locate"]))
    assert view(client, share).status_code == 410
    with Session(engine) as session:
        assert session.get(TripShare, share["id"]).latitude is None
