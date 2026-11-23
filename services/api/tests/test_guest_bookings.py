from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from pydantic import ValidationError
from test_v2 import create_approval_journey, verify_driver

from app.schemas.journey import BookingGuest


@pytest.mark.parametrize("mode", ["instant", "approval"])
def test_guest_seats_follow_the_same_booking_lifecycle(client, authenticated, mode):
    driver = authenticated()
    booker = authenticated(subject="booker")
    other = authenticated(subject="other")
    offer = {
        "booking_mode": mode,
        "stops": [
            {"name": "Library", "minutes": 0, "metres": 0},
            {"name": "Market", "minutes": 20, "metres": 5000},
        ],
        "departure": (datetime.now(UTC) + timedelta(minutes=20)).isoformat(),
        "capacity": 2,
        "price_paise": 1200,
    }
    if mode == "approval":
        offer["vehicle_id"] = verify_driver(client, authenticated)
    created = client.post("/v1/journeys", json=offer, headers=driver)
    assert created.status_code == 201, created.text
    base = "/v1/journeys/" + created.json()["id"]
    assert created.json()["guest_booking_available"]
    key = "request_id" if mode == "approval" else "checkout_id"
    path = base + ("/requests" if mode == "approval" else "/holds")
    data = {"board": 0, "alight": 1, key: str(uuid4())}
    if mode == "approval":
        data.update(consent=True, consent_version="cc-v2-1")
    guest = {"name": "  Jose\u0301   Luna  ", "permission": True}
    original = data | {"guest": guest}
    result = client.post(path, headers=booker, json=original)
    success = 201 if mode == "approval" else 200
    assert result.status_code == success, result.text
    ticket = result.json()
    assert ticket["guest_name"] == "José Luna"
    receipt = base + "/tickets/" + ticket["id"]
    retry = original | {key: str(uuid4()), "guest": guest | {"name": "JOSÉ LUNA"}}
    assert client.post(path, headers=booker, json=retry).json()["id"] == ticket["id"]
    assert client.post(path, headers=booker, json=data).status_code == 409
    assert client.post(path, headers=other, json=original).status_code == 409
    self_ticket = client.post(path, headers=booker, json=data | {key: str(uuid4())}).json()
    assert self_ticket["id"] != ticket["id"] and self_ticket["guest_name"] is None
    third = original | {key: str(uuid4()), "guest": guest | {"name": "Anika"}}
    assert client.post(path, headers=booker, json=third).status_code == 409
    for headers in (None, other):
        assert client.get(base, headers=headers).json()["tickets"] == []
        search = client.post("/v1/journeys/search", headers=headers, json={}).json()["items"]
        assert all(not i["journey"]["tickets"] for i in search)
    if mode == "approval":
        pending = client.get(base + "/requests", headers=driver).json()
        assert {t["guest_name"] for t in pending} == {None, "José Luna"}
        assert client.post(receipt + "/approve", headers=driver).is_success
    paid = client.post(receipt + "/sandbox-pay", headers=booker).json()
    assert paid["guest_name"] == "José Luna" and paid["charged_paise"] == 1200
    assert client.post(receipt + "/sandbox-pay", headers=other).status_code == 404
    assert client.get(receipt + "/messages", headers=driver).json()["guest_name"] == "José Luna"
    assert client.get(receipt + "/messages", headers=other).status_code == 404
    inbox = client.get("/v1/me/conversations", headers=booker).json()["items"]
    assert any(r["ticket_id"] == ticket["id"] and r["guest_name"] == "José Luna" for r in inbox)
    assert client.get(receipt + "/driver-location", headers=booker).status_code == 403
    assert client.put(receipt + "/rating", headers=booker, json={"stars": 5}).status_code == 403
    if mode == "approval":
        assert client.post(receipt + "/boarding-challenge", headers=booker).is_success
        assert client.post(receipt + "/boarding-challenge", headers=other).status_code == 404
    cancelled = client.post(receipt + "/cancel", headers=booker).json()
    assert cancelled["state"] == "rider_cancelled" and cancelled["refund_paise"] == 900
    assert client.post(path, headers=booker, json=third).status_code == success


@pytest.mark.parametrize(
    "guest",
    [
        {"name": "", "permission": True},
        {"name": "   ", "permission": True},
        {"name": "a" * 61, "permission": True},
        {"name": "Ava", "permission": False},
        {"name": "Ava"},
        {"name": "Ava", "permission": "yes"},
        {"name": "Ava\u202e", "permission": True},
        {"name": "a@b.com", "permission": True},
        {"name": "1234567890", "permission": True},
        {"name": "Ava", "permission": True, "phone": "123"},
    ],
)
def test_guest_requires_a_name_and_explicit_permission(guest):
    with pytest.raises(ValidationError):
        BookingGuest.model_validate(guest)


def test_guest_cannot_inherit_private_circle_membership(client, authenticated):
    driver, member = authenticated(), authenticated(subject="member")
    circle = client.post("/v1/circles", headers=driver, json={"name": "Members only"}).json()["id"]
    invite = client.post(f"/v1/circles/{circle}/invitations", headers=driver).json()
    assert client.post(
        "/v1/circle-invitations/redeem", headers=member, json={"token": invite["token"]}
    ).is_success
    jid = create_approval_journey(
        client, authenticated, verify_driver(client, authenticated), circle
    )
    base = "/v1/journeys/" + jid
    assert not client.get(base, headers=member).json()["guest_booking_available"]
    data = {
        "board": 0,
        "alight": 1,
        "consent": True,
        "consent_version": "cc-v2-1",
        "request_id": str(uuid4()),
    }
    assert (
        client.post(
            base + "/requests",
            headers=member,
            json=data | {"guest": {"name": "Ravi", "permission": True}},
        ).status_code
        == 403
    )
    assert client.post(base + "/requests", headers=member, json=data).status_code == 201
