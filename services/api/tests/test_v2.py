"""V2 trust, approval, boarding, private circles and recurrence API regressions."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Barrier
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy.orm import Session

from app.models.journey import Journey, Ticket
from app.models.v2 import BoardingChallenge, SafetyReport


def staff(authenticated):
    return authenticated(subject="reviewer", scope="rides:read rides:write v2:staff")


def verify_driver(client, authenticated):
    driver = authenticated()
    assert (
        client.put(
            "/v1/me/profile", headers=driver, json={"display_name": "Commuter A"}
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/v1/me/driver-verification",
            headers=driver,
            json={"evidence_reference": "review-case-demo-1"},
        ).status_code
        == 202
    )
    vehicle = client.post(
        "/v1/me/vehicles",
        headers=driver,
        json={
            "make": "Honda",
            "model": "City",
            "color": "White",
            "registration": "AP12AB1234",
            "seat_capacity": 3,
        },
    )
    assert vehicle.status_code == 201, vehicle.text
    vid = vehicle.json()["id"]
    assert (
        client.post(
            "/v1/staff/driver-verifications/driver-a/decision",
            headers=driver,
            json={"decision": "approved"},
        ).status_code
        == 403
    )
    reviewer = staff(authenticated)
    assert client.post(
        "/v1/staff/driver-verifications/driver-a/decision",
        headers=reviewer,
        json={"decision": "approved"},
    ).is_success
    assert client.post(
        "/v1/staff/vehicles/" + vid + "/decision",
        headers=reviewer,
        json={"decision": "approved"},
    ).is_success
    assert client.get("/v1/me/driver-eligibility", headers=driver).json()["can_offer"]
    return vid


def create_approval_journey(client, authenticated, vid, circle_id=None, minutes=120):
    payload = {
        "stops": [
            {"name": "Public point A", "metres": 0, "minutes": 0},
            {"name": "Public point B", "metres": 20000, "minutes": 30},
        ],
        "departure": (datetime.now(UTC) + timedelta(minutes=minutes)).isoformat(),
        "price_paise": 15000,
        "capacity": 1,
        "booking_mode": "approval",
        "vehicle_id": vid,
    }
    if circle_id:
        payload["circle_id"] = circle_id
    response = client.post("/v1/journeys", headers=authenticated(), json=payload)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def request(client, authenticated, jid, name="passenger"):
    return client.post(
        f"/v1/journeys/{jid}/requests",
        headers=authenticated(subject=name),
        json={
            "request_id": str(uuid4()),
            "board": 0,
            "alight": 1,
            "consent": True,
            "consent_version": "cc-v2-1",
        },
    )


def test_driver_must_be_reviewed_and_vehicle_capacity_enforced(client, authenticated):
    data = {
        "stops": [
            {"name": "A", "metres": 0, "minutes": 0},
            {"name": "B", "metres": 20000, "minutes": 30},
        ],
        "departure": (datetime.now(UTC) + timedelta(hours=3)).isoformat(),
        "price_paise": 15000,
        "capacity": 1,
        "booking_mode": "approval",
        "vehicle_id": str(uuid4()),
    }
    assert client.post("/v1/journeys", headers=authenticated(), json=data).status_code == 403
    vid = verify_driver(client, authenticated)
    assert (
        client.post(
            "/v1/journeys",
            headers=authenticated(),
            json=data | {"vehicle_id": vid, "capacity": 4},
        ).status_code
        == 422
    )
    jid = create_approval_journey(client, authenticated, vid)
    result = client.get("/v1/journeys/" + jid, headers=authenticated(subject="passenger")).json()
    assert result["driver_verified"] is True
    assert result["vehicle_verified"] is True
    assert result["vehicle"]["make"] == "Honda"
    assert "registration" not in str(result)


def test_driver_approves_only_one_overlapping_seat(client, authenticated):
    vid = verify_driver(client, authenticated)
    jid = create_approval_journey(client, authenticated, vid)
    rider = authenticated(subject="rider-1")
    endpoint = f"/v1/journeys/{jid}"
    invalid = client.post(
        endpoint + "/requests",
        headers=rider,
        json={
            "request_id": str(uuid4()),
            "board": 0,
            "alight": 1,
            "consent_version": "cc-v2-1",
        },
    )
    assert invalid.status_code == 422
    first = request(client, authenticated, jid, "rider-1")
    second = request(client, authenticated, jid, "rider-2")
    assert first.status_code == second.status_code == 201
    a, b = first.json()["id"], second.json()["id"]
    assert (
        client.post(
            endpoint + "/holds",
            headers=rider,
            json={"board": 0, "alight": 1, "checkout_id": str(uuid4())},
        ).status_code
        == 409
    )
    assert (
        client.post(endpoint + f"/tickets/{a}/approve", headers=authenticated()).json()["state"]
        == "held"
    )
    assert (
        client.post(endpoint + f"/tickets/{b}/approve", headers=authenticated()).status_code == 409
    )
    pay = client.post(endpoint + f"/tickets/{a}/sandbox-pay", headers=rider)
    assert pay.status_code == 200, pay.text
    assert pay.json()["charged_paise"] == 15000
    assert (
        client.post(endpoint + f"/tickets/{a}/sandbox-pay", headers=rider).json()["charged_paise"]
        == 15000
    )
    assert (
        client.post(endpoint + f"/tickets/{b}/decline", headers=authenticated()).json()["state"]
        == "driver_cancelled"
    )


def test_boarding_pin_only_works_once_and_rider_confirms_completion(client, authenticated):
    vid = verify_driver(client, authenticated)
    jid = create_approval_journey(client, authenticated, vid, minutes=15)
    rider = authenticated(subject="passenger")
    tid = request(client, authenticated, jid).json()["id"]
    base = f"/v1/journeys/{jid}/tickets/{tid}"
    client.post(base + "/approve", headers=authenticated()).raise_for_status()
    client.post(base + "/sandbox-pay", headers=rider).raise_for_status()
    assert client.post(base + "/boarding-challenge", headers=authenticated()).status_code == 404
    pin = client.post(base + "/boarding-challenge", headers=rider)
    assert pin.status_code == 200, pin.text
    assert len(pin.json()["pin"]) == 6
    assert (
        client.post(
            base + "/board",
            headers=authenticated(),
            json={
                "pin": "XXXXXX",
            },
        ).status_code
        == 422
    )
    assert (
        client.post(
            base + "/board",
            headers=authenticated(),
            json={
                "pin": "999999" if pin.json()["pin"] != "999999" else "888888",
            },
        ).status_code
        == 422
    )
    assert (
        client.post(
            base + "/board",
            headers=authenticated(),
            json={
                "pin": pin.json()["pin"],
            },
        ).json()["travel_state"]
        == "boarded"
    )
    assert (
        client.post(
            base + "/board",
            headers=authenticated(),
            json={
                "pin": pin.json()["pin"],
            },
        ).status_code
        == 409
    )
    assert client.post(base + "/complete", headers=rider).status_code == 409
    with Session(client.app.state.engine) as session:
        journey = session.get(Journey, jid)
        journey.departure = datetime.now(UTC) - timedelta(hours=2)
        session.commit()
    assert client.post(base + "/complete", headers=rider).json()["travel_state"] == "completed"
    with Session(client.app.state.engine) as session:
        assert session.get(Ticket, tid).travel_state == "completed"
        assert session.get(BoardingChallenge, tid).used_at is not None


def test_circle_only_journey_is_invisible_to_nonmembers(client, authenticated):
    vid = verify_driver(client, authenticated)
    circle = client.post(
        "/v1/circles", headers=authenticated(), json={"name": "Office circle"}
    ).json()
    cid = circle["id"]
    jid = create_approval_journey(client, authenticated, vid, circle_id=cid)
    outsider = authenticated(subject="outsider")
    assert client.get(f"/v1/journeys/{jid}", headers=outsider).status_code == 404
    assert client.get(f"/v1/circles/{cid}/journeys", headers=outsider).status_code == 404
    assert request(client, authenticated, jid, "outsider").status_code == 404
    assert jid not in str(client.post("/v1/journeys/search", json={}).json())
    invitation = client.post(f"/v1/circles/{cid}/invitations", headers=authenticated()).json()[
        "token"
    ]
    assert client.post(
        "/v1/circle-invitations/redeem", headers=outsider, json={"token": invitation}
    ).is_success
    assert (
        client.post(
            "/v1/circle-invitations/redeem",
            headers=authenticated(subject="another"),
            json={"token": invitation},
        ).status_code
        == 410
    )
    available = client.get(f"/v1/circles/{cid}/journeys", headers=outsider)
    assert available.status_code == 200
    assert available.json()[0]["journey"]["id"] == jid
    assert request(client, authenticated, jid, "outsider").status_code == 201


def test_recurring_template_materializes_idempotently(client, authenticated):
    vid = verify_driver(client, authenticated)
    tomorrow = datetime.now(ZoneInfo("Asia/Kolkata")).date() + timedelta(days=1)
    stops = [
        {"name": "A", "metres": 0, "minutes": 0},
        {"name": "B", "metres": 15000, "minutes": 30},
    ]
    payload = {
        "stops": stops,
        "local_time": "23:30:00",
        "timezone": "Asia/Kolkata",
        "weekdays": list(range(7)),
        "starts_on": tomorrow.isoformat(),
        "ends_on": (tomorrow + timedelta(days=3)).isoformat(),
        "price_paise": 15000,
        "capacity": 1,
        "vehicle_id": vid,
        "booking_mode": "approval",
    }
    response = client.post("/v1/recurring-rides", headers=authenticated(), json=payload)
    assert response.status_code == 201, response.text
    rid = response.json()["id"]
    skipped = (tomorrow + timedelta(days=1)).isoformat()
    assert client.put(
        f"/v1/recurring-rides/{rid}/exceptions/{skipped}",
        headers=authenticated(),
        json={"reason": "Leave day"},
    ).is_success
    first = client.post(f"/v1/recurring-rides/{rid}/materialize", headers=authenticated())
    assert first.status_code == 200, first.text
    assert first.json()["count"] == 3
    second = client.post(f"/v1/recurring-rides/{rid}/materialize", headers=authenticated())
    assert second.json()["count"] == 0

    occurrence = first.json()["created"][0]
    exception = f"/v1/recurring-rides/{rid}/exceptions/{occurrence['date']}"
    jid = occurrence["id"]
    tid = request(client, authenticated, jid).json()["id"]
    assert (
        client.put(exception, headers=authenticated(), json={"reason": "Day off"}).status_code
        == 409
    )
    assert client.post(
        f"/v1/journeys/{jid}/tickets/{tid}/decline", headers=authenticated()
    ).is_success
    assert client.put(exception, headers=authenticated(), json={"reason": "Day off"}).is_success
    assert client.get(f"/v1/journeys/{jid}", headers=authenticated()).json()["cancelled"]
    assert (
        client.post(f"/v1/recurring-rides/{rid}/materialize", headers=authenticated()).json()[
            "count"
        ]
        == 0
    )


def test_confidential_safety_report_requires_trip_participation(client, authenticated):
    vid = verify_driver(client, authenticated)
    jid = create_approval_journey(client, authenticated, vid)
    data = {
        "journey_id": jid,
        "category": "unsafe_driving",
        "description": "The vehicle made an unsafe manoeuvre during the trip.",
    }
    outsider = authenticated(subject="outsider")
    assert client.post("/v1/safety-reports", headers=outsider, json=data).status_code == 404
    author = authenticated()
    saved = client.post("/v1/safety-reports", headers=author, json=data)
    assert saved.status_code == 201
    report_id = saved.json()["id"]
    assert client.get("/v1/me/safety-reports", headers=outsider).json() == []
    assert len(client.get("/v1/me/safety-reports", headers=author).json()) == 1
    assert client.get("/v1/staff/safety-reports", headers=outsider).status_code == 403
    reviewer = staff(authenticated)
    assert len(client.get("/v1/staff/safety-reports", headers=reviewer).json()) == 1
    assert client.post(
        f"/v1/staff/safety-reports/{report_id}/review",
        headers=reviewer,
        json={"state": "reviewing", "note": "Case assigned for human review"},
    ).is_success
    with Session(client.app.state.engine) as session:
        assert session.get(SafetyReport, report_id).state == "reviewing"


def test_circle_revocation_leave_and_existing_receipts(client, authenticated):
    owner, rider = authenticated(), authenticated(subject="passenger")
    cid, other = [
        client.post("/v1/circles", headers=owner, json={"name": name}).json()["id"]
        for name in ("Morning crew", "Evening crew")
    ]
    invite = f"/v1/circles/{cid}/invitations"
    leave = f"/v1/circles/{cid}/members/me"
    redeem = "/v1/circle-invitations/redeem"
    first = client.post(invite, headers=owner).json()
    assert client.get(invite, headers=owner).json() == [
        {"id": first["id"], "expires_at": first["expires_at"]}
    ]
    assert client.get(invite, headers=rider).status_code == 404
    assert client.delete(invite + "/" + first["id"], headers=rider).status_code == 404
    assert (
        client.delete(f"/v1/circles/{other}/invitations/" + first["id"], headers=owner).status_code
        == 404
    )
    for _ in range(2):
        assert client.delete(invite + "/" + first["id"], headers=owner).json() == {"revoked": True}
    assert client.post(redeem, headers=rider, json={"token": first["token"]}).status_code == 410
    assert client.get(invite, headers=owner).json() == []
    second = client.post(invite, headers=owner).json()
    assert client.post(redeem, headers=rider, json={"token": second["token"]}).is_success
    assert client.delete(invite + "/" + second["id"], headers=owner).status_code == 409

    vid = verify_driver(client, authenticated)
    jid = create_approval_journey(client, authenticated, vid, cid)
    other_jid = create_approval_journey(client, authenticated, vid, cid)
    tid = request(client, authenticated, jid).json()["id"]
    journey = f"/v1/journeys/{jid}"
    assert client.delete(leave, headers=owner).status_code == 409
    assert client.delete(leave, headers=rider).json() == {"left": True}
    assert client.get("/v1/circles", headers=rider).json() == []
    assert client.get(f"/v1/journeys/{other_jid}", headers=rider).status_code == 404
    assert request(client, authenticated, other_jid).status_code == 404
    detail = client.get(journey, headers=rider).json()
    assert not detail["booking_eligible"] and detail["tickets"][0]["id"] == tid
    assert client.get(journey + "/tickets/" + tid + "/notifications", headers=rider).is_success
    assert client.post(redeem, headers=rider, json={"token": second["token"]}).status_code == 410
    third = client.post(invite, headers=owner).json()
    assert client.post(redeem, headers=rider, json={"token": third["token"]}).is_success
    assert client.get(f"/v1/journeys/{other_jid}", headers=rider).json()["booking_eligible"]


def test_circle_invitation_redemption_and_revocation_are_atomic(client, authenticated):
    if client.app.state.engine.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL row locks")
    owner, rider = authenticated(), authenticated(subject="racing-member")
    circle = client.post("/v1/circles", headers=owner, json={"name": "Weekend rides"}).json()["id"]
    path = f"/v1/circles/{circle}/invitations"
    invitation = client.post(path, headers=owner).json()
    barrier = Barrier(2)

    def accept():
        barrier.wait(timeout=5)
        return client.post(
            "/v1/circle-invitations/redeem", headers=rider, json={"token": invitation["token"]}
        ).status_code

    def revoke():
        barrier.wait(timeout=5)
        return client.delete(path + "/" + invitation["id"], headers=owner).status_code

    with ThreadPoolExecutor(max_workers=2) as workers:
        joined, revoked = workers.submit(accept), workers.submit(revoke)
        outcome = joined.result(timeout=10), revoked.result(timeout=10)
    assert outcome in {(200, 409), (410, 200)}
    memberships = client.get("/v1/circles", headers=rider).json()
    assert [c["id"] for c in memberships] == ([circle] if outcome[0] == 200 else [])
    assert client.get(path, headers=owner).json() == []
