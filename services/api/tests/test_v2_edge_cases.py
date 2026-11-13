"""V2 authorization and lifecycle cases beyond the primary happy path."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy.orm import Session
from test_v2 import create_approval_journey, request, staff, verify_driver

from app.models.journey import Ticket
from app.models.v2 import BoardingChallenge


def test_profile_and_driver_application_cannot_self_approve(client, authenticated):
    owner = authenticated(subject="new-user")
    outsider = authenticated(subject="another-user")
    assert client.get("/v1/me/profile").status_code == 401
    assert client.get("/v1/me/driver-eligibility", headers=owner).json()["can_offer"] is False
    assert client.put(
        "/v1/me/profile", headers=owner, json={"display_name": "Commuter R"}
    ).is_success
    assert client.get("/v1/me/profile", headers=outsider).json()["display_name"] is None
    for _ in range(2):
        result = client.post(
            "/v1/me/driver-verification",
            headers=owner,
            json={"evidence_reference": "manual-approval-case"},
        )
        assert result.status_code == 202
    assert client.get("/v1/me/driver-eligibility", headers=owner).json()["can_offer"] is False
    assert client.get("/v1/staff/driver-verifications", headers=owner).status_code == 403
    pending = client.get("/v1/staff/driver-verifications", headers=staff(authenticated))
    assert pending.status_code == 200
    assert any(r["subject"] == "new-user" for r in pending.json())


def test_verified_driver_can_be_suspended(client, authenticated):
    vid = verify_driver(client, authenticated)
    assert client.post(
        "/v1/staff/driver-verifications/driver-a/decision",
        headers=staff(authenticated),
        json={"decision": "suspended"},
    ).is_success
    result = client.get("/v1/me/driver-eligibility", headers=authenticated())
    assert result.json()["can_offer"] is False
    payload = {
        "stops": [
            {"name": "A", "metres": 0, "minutes": 0},
            {"name": "B", "metres": 20000, "minutes": 30},
        ],
        "departure": (datetime.now(UTC) + timedelta(hours=4)).isoformat(),
        "price_paise": 15000,
        "capacity": 1,
        "vehicle_id": vid,
        "booking_mode": "approval",
    }
    assert client.post("/v1/journeys", headers=authenticated(), json=payload).status_code == 403


def test_request_idempotence_cancellation_and_expiry(client, authenticated):
    vid = verify_driver(client, authenticated)
    jid = create_approval_journey(client, authenticated, vid)
    rider = authenticated(subject="rider-one")
    key = str(uuid4())
    payload = {
        "request_id": key,
        "board": 0,
        "alight": 1,
        "consent": True,
        "consent_version": "cc-v2-1",
    }
    endpoint = f"/v1/journeys/{jid}"
    a = client.post(endpoint + "/requests", headers=rider, json=payload)
    b = client.post(endpoint + "/requests", headers=rider, json=payload)
    assert a.status_code == b.status_code == 201
    assert a.json()["id"] == b.json()["id"]
    assert (
        client.post(
            endpoint + "/requests", headers=authenticated(subject="wrong-rider"), json=payload
        ).status_code
        == 409
    )
    assert (
        client.post(
            endpoint + f"/tickets/{key}/cancel", headers=rider, json={"max_fee_paise": 0}
        ).json()["state"]
        == "rider_cancelled"
    )
    new = request(client, authenticated, jid, "rider-one")
    assert new.status_code == 201
    tid = new.json()["id"]
    with Session(client.app.state.engine) as session:
        session.get(Ticket, tid).expires = datetime.now(UTC) - timedelta(seconds=2)
        session.commit()
    detail = client.get(endpoint, headers=rider).json()
    assert next(t for t in detail["tickets"] if t["id"] == tid)["state"] == "expired"
    assert client.get(endpoint + "/requests", headers=authenticated()).json() == []


def test_circle_invites_require_owner_and_cannot_be_reused(client, authenticated):
    owner = authenticated()
    circle = client.post("/v1/circles", headers=owner, json={"name": "Morning commuters"}).json()
    cid = circle["id"]
    outsider = authenticated(subject="outsider")
    assert client.get("/v1/circles", headers=outsider).json() == []
    assert client.get(f"/v1/circles/{cid}", headers=outsider).status_code == 404
    assert client.post(f"/v1/circles/{cid}/invitations", headers=outsider).status_code == 404
    assert (
        client.post(
            "/v1/circle-invitations/redeem", headers=outsider, json={"token": "x" * 43}
        ).status_code
        == 410
    )
    issued = client.post(f"/v1/circles/{cid}/invitations", headers=owner)
    assert issued.headers["cache-control"] == "no-store"
    invite = issued.json()
    remaining = (datetime.fromisoformat(invite["expires_at"]) - datetime.now(UTC)).total_seconds()
    assert 0 < invite["expires_in_seconds"] - 60 < remaining <= invite["expires_in_seconds"]
    assert len(invite["token"]) > 32
    assert client.post(
        "/v1/circle-invitations/redeem", headers=outsider, json={"token": invite["token"]}
    ).is_success
    assert client.get(f"/v1/circles/{cid}", headers=outsider).json()["members"] == 2
    assert client.post(f"/v1/circles/{cid}/invitations", headers=outsider).status_code == 404
    assert (
        client.post(
            "/v1/circle-invitations/redeem",
            headers=authenticated(subject="another"),
            json={"token": invite["token"]},
        ).status_code
        == 410
    )


def test_boarding_pin_rate_limit_persists_attempts(client, authenticated):
    vid = verify_driver(client, authenticated)
    jid = create_approval_journey(client, authenticated, vid, minutes=15)
    rider = authenticated(subject="passenger")
    tid = request(client, authenticated, jid).json()["id"]
    base = f"/v1/journeys/{jid}/tickets/{tid}"
    client.post(base + "/approve", headers=authenticated()).raise_for_status()
    client.post(base + "/sandbox-pay", headers=rider).raise_for_status()
    pin = client.post(base + "/boarding-challenge", headers=rider).json()["pin"]
    wrong = "000000" if pin != "000000" else "999999"
    statuses = [
        client.post(base + "/board", headers=authenticated(), json={"pin": wrong}).status_code
        for _ in range(5)
    ]
    assert statuses == [422, 422, 422, 422, 429]
    assert (
        client.post(base + "/board", headers=authenticated(), json={"pin": pin}).status_code == 429
    )
    with Session(client.app.state.engine) as session:
        challenge = session.get(BoardingChallenge, tid)
        assert challenge.attempts == 5
        assert challenge.used_at is None


def test_recurring_ride_requires_verified_approval_mode(client, authenticated):
    vid = verify_driver(client, authenticated)
    payload = {
        "stops": [
            {"name": "A", "metres": 0, "minutes": 0},
            {"name": "B", "metres": 10000, "minutes": 30},
        ],
        "local_time": "08:30:00",
        "timezone": "Asia/Kolkata",
        "weekdays": [0, 1, 2, 3, 4],
        "starts_on": (datetime.now(UTC).date() + timedelta(days=1)).isoformat(),
        "ends_on": (datetime.now(UTC).date() + timedelta(days=30)).isoformat(),
        "price_paise": 12000,
        "capacity": 2,
        "vehicle_id": vid,
        "booking_mode": "instant",
    }
    assert (
        client.post("/v1/recurring-rides", headers=authenticated(), json=payload).status_code == 422
    )
    assert (
        client.post(
            "/v1/recurring-rides",
            headers=authenticated(subject="outsider"),
            json=payload | {"booking_mode": "approval"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/v1/recurring-rides",
            headers=authenticated(),
            json=payload | {"booking_mode": "approval", "capacity": 4},
        ).status_code
        == 422
    )


def test_staff_only_safety_review_events(client, authenticated):
    vid = verify_driver(client, authenticated)
    jid = create_approval_journey(client, authenticated, vid)
    report = client.post(
        "/v1/safety-reports",
        headers=authenticated(),
        json={
            "journey_id": jid,
            "category": "pickup_issue",
            "description": "We could not find the agreed public pickup point.",
        },
    ).json()
    reporter = authenticated()
    outsider = authenticated(subject="outsider")
    assert (
        client.get(f"/v1/staff/safety-reports/{report['id']}/events", headers=outsider).status_code
        == 403
    )
    reviewer = staff(authenticated)
    assert client.post(
        f"/v1/staff/safety-reports/{report['id']}/review",
        headers=reviewer,
        json={"state": "reviewing", "note": "Assigned to the trust and safety reviewer"},
    ).is_success
    events = client.get(f"/v1/staff/safety-reports/{report['id']}/events", headers=reviewer).json()
    assert len(events) == 1 and events[0]["state"] == "reviewing"
    assert client.get("/v1/me/safety-reports", headers=outsider).json() == []
    assert len(client.get("/v1/me/safety-reports", headers=reporter).json()) == 1


def test_staff_reviewers_cannot_approve_their_own_verifications(client, authenticated):
    driver = authenticated()
    same_account_staff = authenticated(scope="rides:read rides:write v2:staff")
    application = client.post(
        "/v1/me/driver-verification",
        headers=driver,
        json={"evidence_reference": "manual-identity-review-12345"},
    )
    assert application.status_code == 202
    vehicle = client.post(
        "/v1/me/vehicles",
        headers=driver,
        json={
            "make": "Maruti",
            "model": "Brezza",
            "color": "Blue",
            "registration": "AP01AB1234",
            "seat_capacity": 3,
        },
    )
    assert vehicle.status_code == 201
    vehicle_id = vehicle.json()["id"]
    paths = (
        "/v1/staff/driver-verifications/driver-a/decision",
        f"/v1/staff/vehicles/{vehicle_id}/decision",
    )
    for url in paths:
        denied = client.post(url, headers=same_account_staff, json={"decision": "approved"})
        assert denied.status_code == 403
        approved = client.post(url, headers=staff(authenticated), json={"decision": "approved"})
        assert approved.status_code == 200


def test_reviewing_replaced_evidence_or_an_already_decided_vehicle_conflicts(client, authenticated):
    driver, reviewer = authenticated(), staff(authenticated)
    applications = "/v1/staff/driver-verifications"
    for reference in ("case-reference-old", "case-reference-new"):
        assert (
            client.post(
                "/v1/me/driver-verification", headers=driver, json={"evidence_reference": reference}
            ).status_code
            == 202
        )
        pending = client.get(applications, headers=reviewer).json()[0]
        if reference.endswith("old"):
            original = pending["submitted_at"]
    path = applications + "/driver-a/decision"
    stale = {
        "decision": "approved",
        "expected_status": "pending",
        "expected_submitted_at": original,
    }
    assert client.post(path, headers=reviewer, json=stale).status_code == 409
    assert (
        client.get(applications, headers=reviewer).json()[0]["evidence_reference"]
        == "case-reference-new"
    )
    fresh = {**stale, "expected_submitted_at": pending["submitted_at"]}
    assert client.post(path, headers=reviewer, json=fresh).json()["status"] == "approved"
    assert (
        client.post(path, headers=reviewer, json={**fresh, "decision": "rejected"}).status_code
        == 409
    )
    assert (
        client.get("/v1/me/driver-eligibility", headers=driver).json()["driver_status"]
        == "approved"
    )

    car = client.post(
        "/v1/me/vehicles",
        headers=driver,
        json={
            "make": "Test",
            "model": "City",
            "color": "Blue",
            "registration": "CC-UNIT-001",
            "seat_capacity": 3,
        },
    )
    assert car.status_code == 201
    queue = "/v1/staff/vehicles"
    vehicle = client.get(queue, headers=reviewer).json()[0]
    path = queue + "/" + vehicle["id"] + "/decision"
    expected = {"expected_status": "pending", "expected_submitted_at": vehicle["submitted_at"]}
    assert (
        client.post(path, headers=reviewer, json={"decision": "rejected", **expected}).json()[
            "status"
        ]
        == "rejected"
    )
    assert (
        client.post(path, headers=reviewer, json={"decision": "approved", **expected}).status_code
        == 409
    )
    assert client.get(queue, headers=reviewer).json() == []
