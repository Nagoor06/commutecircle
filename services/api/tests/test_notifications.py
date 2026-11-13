import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Notification, NotificationPreference, PaymentEntry, Ticket, VerificationLimit
from app.services import notification_outbox as outbox
from app.services import notification_preferences as preferences
from app.services import notification_providers as provider
from tests.test_journeys import listing

OWNER = preferences.owner_key("https://identity.example", "passenger")
PATH = "/v1/me/notifications"


@pytest.fixture
def providers(monkeypatch):
    for key, value in {
        "RESEND_API_KEY": "test-key",
        "NOTIFICATION_FROM_EMAIL": "CommuteCircle <trips@example.com>",
        "TWILIO_ACCOUNT_SID": "AC" + "1" * 32,
        "TWILIO_AUTH_TOKEN": "test-secret",
        "TWILIO_SMS_SERVICE_SID": "MG" + "2" * 32,
        "TWILIO_VERIFY_SERVICE_SID": "VA" + "3" * 32,
        "TWILIO_WHATSAPP_FROM": "whatsapp:+15550000000",
        "TWILIO_WHATSAPP_CONTENT_SID": "HX" + "4" * 32,
    }.items():
        monkeypatch.setenv(key, value)


def contact(client, phone="sms"):
    with Session(client.app.state.engine) as session, session.begin():
        session.add(
            NotificationPreference(
                owner=OWNER,
                email="passenger@example.com",
                email_enabled=True,
                phone="+15550000001",
                phone_channel=phone,
            )
        )


def book(client, authenticated, pay=True):
    route = listing(client, authenticated)
    headers = authenticated(subject="passenger")
    tid = str(uuid4())
    assert client.post(
        route + "/holds",
        headers=headers,
        json={
            "board": 0,
            "alight": 1,
            "checkout_id": tid,
        },
    ).is_success
    path = route + "/tickets/" + tid
    if pay:
        assert client.post(path + "/sandbox-pay", headers=headers).is_success
    return path, tid, headers


def rows(client):
    with Session(client.app.state.engine) as session:
        return list(session.scalars(select(Notification).order_by(Notification.channel)))


def test_verified_email_consent_and_private_preferences(client, authenticated, monkeypatch):
    headers = authenticated(subject="passenger")
    assert client.get(PATH).status_code == 401
    assert (
        client.put(
            PATH, headers=headers, json={"email_enabled": True, "phone_channel": "none"}
        ).status_code
        == 409
    )
    assert (
        client.put(
            PATH, headers=headers, json={"email_enabled": False, "phone_channel": "sms"}
        ).status_code
        == 409
    )
    data = {"sub": "other", "email": "passenger@example.com", "email_verified": True}
    calls = []

    def userinfo(url, **kwargs):
        calls.append((url, kwargs))
        return httpx.Response(200, json=data, request=httpx.Request("GET", url))

    monkeypatch.setattr(provider.httpx, "get", userinfo)
    assert client.post(PATH + "/email", headers=headers).status_code == 409
    data["sub"] = "passenger"
    data["email_verified"] = False
    assert client.post(PATH + "/email", headers=headers).status_code == 409
    data["email_verified"] = True
    result = client.post(PATH + "/email", headers=headers)
    assert result.json()["email"] == "passenger@example.com"
    assert result.json()["email_enabled"] is True
    assert calls[-1][0] == "https://identity.example/userinfo"
    assert calls[-1][1]["follow_redirects"] is False
    assert client.get(PATH, headers=authenticated()).json()["email"] is None
    assert (
        client.put(
            PATH, headers=headers, json={"email_enabled": False, "phone_channel": "none"}
        ).json()["email_enabled"]
        is False
    )
    monkeypatch.setattr(
        provider.httpx, "get", lambda *a, **k: (_ for _ in ()).throw(httpx.ConnectError("private"))
    )
    assert client.post(PATH + "/email", headers=headers).status_code == 503


def test_phone_verification_is_bound_to_user_number_and_consent(
    client, authenticated, monkeypatch, providers
):
    headers = authenticated(subject="passenger")
    phone, sid = "+15550000001", "VE" + "5" * 32
    calls = []

    def verify(resource, data):
        calls.append((resource, data))
        return {
            "sid": sid,
            "to": phone,
            "status": "approved" if data.get("Code") == "123456" else "pending",
        }

    monkeypatch.setattr(provider, "verification", verify)
    assert (
        client.post(
            PATH + "/phone/code", headers=headers, json={"phone": phone, "consent": False}
        ).status_code
        == 422
    )
    assert (
        client.post(
            PATH + "/phone/code", headers=headers, json={"phone": "555", "consent": True}
        ).status_code
        == 422
    )
    assert (
        client.post(
            PATH + "/phone/code", headers=headers, json={"phone": phone, "consent": True}
        ).status_code
        == 202
    )
    assert (
        client.post(
            PATH + "/phone/code", headers=headers, json={"phone": phone, "consent": True}
        ).status_code
        == 429
    )
    assert (
        client.post(
            PATH + "/phone/verify", headers=authenticated(), json={"code": "123456"}
        ).status_code
        == 409
    )
    assert (
        client.post(PATH + "/phone/verify", headers=headers, json={"code": "000000"}).status_code
        == 409
    )
    result = client.post(PATH + "/phone/verify", headers=headers, json={"code": "123456"})
    assert result.json()["phone"] == phone and result.json()["phone_channel"] == "none"
    assert calls[-1][1] == {"VerificationSid": sid, "Code": "123456"}
    assert (
        client.post(PATH + "/phone/verify", headers=headers, json={"code": "123456"}).status_code
        == 409
    )
    assert (
        client.put(
            PATH, headers=headers, json={"email_enabled": False, "phone_channel": "whatsapp"}
        ).json()["phone_channel"]
        == "whatsapp"
    )


def test_phone_failures_keep_rate_budget_and_attempt_limit(
    client, authenticated, monkeypatch, providers
):
    headers = authenticated(subject="passenger")
    phone = "+15550000001"
    monkeypatch.setattr(
        provider, "verification", lambda *a: (_ for _ in ()).throw(httpx.ReadTimeout("private"))
    )
    assert (
        client.post(
            PATH + "/phone/code", headers=headers, json={"phone": phone, "consent": True}
        ).status_code
        == 503
    )
    assert (
        client.post(
            PATH + "/phone/code", headers=headers, json={"phone": phone, "consent": True}
        ).status_code
        == 429
    )
    with Session(client.app.state.engine) as session, session.begin():
        pref = session.get(NotificationPreference, OWNER)
        pref.verification_sid = "VE" + "5" * 32
        pref.verification_attempts = 4
    assert (
        client.post(PATH + "/phone/verify", headers=headers, json={"code": "123456"}).status_code
        == 409
    )
    with Session(client.app.state.engine) as session:
        assert session.get(NotificationPreference, OWNER).verification_attempts == 5
    assert (
        client.post(PATH + "/phone/verify", headers=headers, json={"code": "123456"}).status_code
        == 409
    )
    monkeypatch.delenv("TWILIO_VERIFY_SERVICE_SID")
    assert (
        client.post(
            PATH + "/phone/code", headers=headers, json={"phone": phone, "consent": True}
        ).status_code
        == 503
    )
    assert (
        client.post(PATH + "/phone/verify", headers=headers, json={"code": "123456"}).status_code
        == 503
    )


def test_booking_alerts_commit_once_only_after_payment_and_are_private(
    client, authenticated, providers
):
    contact(client)
    path, tid, headers = book(client, authenticated, pay=False)
    assert rows(client) == []
    for _ in range(2):
        assert client.post(path + "/sandbox-pay", headers=headers).is_success
    alerts = rows(client)
    assert len(alerts) == 2
    assert {r.channel for r in alerts} == {"email", "sms"}
    assert all(r.event == "paid" and r.state == "queued" for r in alerts)
    assert all("No real money was taken" in r.payload["text"] for r in alerts)
    assert client.get(path + "/notifications", headers=authenticated()).status_code == 404
    assert (
        client.get(path.replace(tid, str(uuid4())) + "/notifications", headers=headers).status_code
        == 404
    )
    body = client.get(path + "/notifications", headers=headers).text
    assert "passenger@example.com" not in body and "+1555" not in body
    assert "recipient" not in body and "provider_id" not in body


def test_payment_and_alert_transaction_roll_back_together(
    client, authenticated, monkeypatch, providers
):
    from app.services import journeys

    contact(client)
    path, tid, headers = book(client, authenticated, pay=False)

    def fail_enqueue(*args, **kwargs):
        raise RuntimeError("database failure")

    monkeypatch.setattr(journeys, "enqueue", fail_enqueue)
    with pytest.raises(RuntimeError):
        client.post(path + "/sandbox-pay", headers=headers)
    with Session(client.app.state.engine) as session:
        assert session.get(Ticket, tid).state == "held"
        assert session.scalar(select(PaymentEntry).where(PaymentEntry.ticket_id == tid)) is None
    assert rows(client) == []


def test_cancellation_suppresses_old_confirmation_and_keeps_full_refund(
    client, authenticated, providers, monkeypatch
):
    contact(client)
    path, tid, headers = book(client, authenticated)
    assert client.post(path + "/cancel", headers=headers).json()["refund_paise"] == 9000
    assert client.post(path + "/cancel", headers=authenticated()).json()["refund_paise"] == 10000
    assert client.post(path + "/cancel", headers=authenticated()).is_success
    sent = []
    monkeypatch.setattr(provider, "send", lambda row: sent.append(row) or ("accepted", "id"))
    outbox.dispatch_batch(client.app.state.engine)
    assert len(sent) == 2 and all(r.event == "driver_cancelled" for r in sent)
    assert all("sandbox refund: INR 100.00" in r.payload["text"] for r in sent)
    assert len([r for r in rows(client) if r.state == "suppressed"]) == 4


def test_retry_isolated_from_booking_and_opt_out_cancels_queued_messages(
    client, authenticated, providers, monkeypatch
):
    contact(client)
    path, tid, headers = book(client, authenticated)
    sent = []
    monkeypatch.setattr(provider, "send", lambda row: sent.append(row.id) or ("retry", None))
    outbox.dispatch_batch(client.app.state.engine)
    assert len(sent) == 2
    outbox.dispatch_batch(client.app.state.engine)
    assert len(sent) == 2, "backoff must prevent immediate retry"
    with Session(client.app.state.engine) as session, session.begin():
        for row in session.scalars(select(Notification)):
            row.available = datetime.now(UTC) - timedelta(seconds=1)
        assert session.get(Ticket, tid).state == "paid"
    assert client.put(
        PATH, headers=headers, json={"email_enabled": False, "phone_channel": "none"}
    ).is_success
    outbox.dispatch_batch(client.app.state.engine)
    assert all(r.state == "suppressed" for r in rows(client))
    assert len(sent) == 2


def test_unconfigured_delivery_is_visible_and_never_claimed_sent(client, authenticated):
    contact(client)
    path, tid, headers = book(client, authenticated)
    assert all(r.state == "unavailable" for r in rows(client))
    assert all(
        r["state"] == "unavailable"
        for r in client.get(path + "/notifications", headers=headers).json()
    )


def test_crash_recovery_does_not_resend_ambiguous_phone_alerts(client, authenticated, providers):
    contact(client)
    book(client, authenticated)
    now = datetime.now(UTC)
    with Session(client.app.state.engine) as session, session.begin():
        for row in session.scalars(select(Notification)):
            row.state, row.attempts, row.updated = "sending", 1, now - timedelta(minutes=3)
    retried = outbox.claim(client.app.state.engine, now)
    assert retried.channel == "email" and retried.attempts == 2
    assert next(r for r in rows(client) if r.channel == "sms").state == "unknown"
    with Session(client.app.state.engine) as session, session.begin():
        row = session.get(Notification, retried.id)
        row.state, row.available, row.created = "queued", now, now - timedelta(hours=2)
    assert outbox.claim(client.app.state.engine, now).state == "expired"


@pytest.mark.parametrize(
    "channel,status,result,expected",
    [
        ("email", 200, {"id": "mail-1"}, "accepted"),
        ("sms", 201, {"sid": "sms-1"}, "accepted"),
        ("whatsapp", 201, {"sid": "wa-1"}, "accepted"),
        ("email", 429, {}, "retry"),
        ("sms", 429, {}, "retry"),
        ("email", 500, {}, "retry"),
        ("sms", 500, {}, "unknown"),
        ("email", 409, {"name": "concurrent_idempotent_requests"}, "retry"),
        ("email", 409, {"name": "invalid_idempotent_request"}, "failed"),
        ("email", 403, {}, "failed"),
        ("sms", 200, {}, "unknown"),
        ("email", 200, {}, "retry"),
    ],
)
def test_provider_contracts_and_retry_classification(
    monkeypatch, providers, channel, status, result, expected
):
    calls = []
    row = SimpleNamespace(
        channel=channel,
        id="event-1",
        recipient="+15550000001",
        payload={
            "sender": "sender",
            "subject": "Booking",
            "text": "No real money was taken.",
            "template": "HX" + "4" * 32,
            "variables": {"1": "ABC"},
        },
    )

    def send(url, **kwargs):
        calls.append((url, kwargs))
        return httpx.Response(status, json=result, request=httpx.Request("POST", url))

    monkeypatch.setattr(provider.httpx, "post", send)
    assert provider.send(row)[0] == expected
    assert calls[0][1]["follow_redirects"] is False
    if channel == "email":
        provider.send(row)
        assert calls[0][1] == calls[1][1], "retries must reuse identical key and frozen payload"
        assert calls[0][1]["headers"]["Idempotency-Key"] == "booking/event-1"
    if channel == "whatsapp":
        assert calls[0][1]["data"]["To"] == "whatsapp:+15550000001"
        assert "Body" not in calls[0][1]["data"]
    monkeypatch.setattr(
        provider.httpx, "post", lambda *a, **k: (_ for _ in ()).throw(httpx.ReadTimeout("secret"))
    )
    assert provider.send(row)[0] == ("retry" if channel == "email" else "unknown")


def test_verification_provider_contract(monkeypatch, providers):
    calls = []
    monkeypatch.setattr(
        provider.httpx,
        "post",
        lambda url, **kwargs: (
            calls.append((url, kwargs))
            or httpx.Response(200, json={"status": "pending"}, request=httpx.Request("POST", url))
        ),
    )
    assert (
        provider.verification("Verifications", {"To": "+15550000001", "Channel": "sms"})["status"]
        == "pending"
    )
    assert calls[0][0].endswith("/Verifications")
    assert calls[0][1]["timeout"] == 8


def test_alert_retention_and_worker_failure_are_safe(
    client, authenticated, providers, monkeypatch, caplog
):
    contact(client)
    book(client, authenticated)
    with Session(client.app.state.engine) as session, session.begin():
        for row in session.scalars(select(Notification)):
            row.created = datetime.now(UTC) - timedelta(days=31)
        pref = session.get(NotificationPreference, OWNER)
        pref.pending_phone, pref.verification_expires = (
            "+15550000002",
            datetime.now(UTC) - timedelta(minutes=1),
        )
        session.add(
            VerificationLimit(
                key="old",
                count=1,
                window=datetime.now(UTC) - timedelta(days=3),
                last=datetime.now(UTC),
            )
        )
    outbox.purge(client.app.state.engine)
    assert all(r.recipient == "" and r.payload == {} for r in rows(client))
    with Session(client.app.state.engine) as session:
        assert session.get(NotificationPreference, OWNER).pending_phone is None
        assert session.get(VerificationLimit, "old") is None
    monkeypatch.setattr(
        outbox,
        "dispatch_batch",
        lambda *a: (_ for _ in ()).throw(RuntimeError("private@example.com")),
    )

    async def stop(*args):
        raise asyncio.CancelledError()

    monkeypatch.setattr(outbox.asyncio, "sleep", stop)
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(outbox.run(client.app.state.engine))
    assert "private@example.com" not in caplog.text


def test_two_workers_claim_each_alert_once(client, authenticated, providers, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    engine = client.app.state.engine
    if engine.dialect.name != "postgresql":
        pytest.skip("requires PostgreSQL SKIP LOCKED")
    contact(client, phone="none")
    book(client, authenticated)
    barrier, sent = Barrier(2), []
    monkeypatch.setattr(
        provider, "send", lambda row: sent.append(row.id) or ("accepted", "provider-1")
    )

    def dispatch():
        barrier.wait(timeout=10)
        outbox.dispatch_batch(engine)

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda _: dispatch(), range(2)))
    assert len(sent) == len(set(sent)) == 1


@pytest.mark.parametrize(
    "action,event", [("approve", "seat_approved"), ("decline", "seat_declined")]
)
def test_request_alerts_follow_decisions_and_recipient_consent(
    client, authenticated, providers, action, event
):
    from tests.test_v2 import create_approval_journey, request, verify_driver

    driver = authenticated()
    rider = authenticated(subject="passenger")
    driver_key = preferences.owner_key("https://identity.example", "driver-a")
    with Session(client.app.state.engine) as session, session.begin():
        session.add(
            NotificationPreference(owner=driver_key, email="driver@example.com", email_enabled=True)
        )
    contact(client, phone="none")
    jid = create_approval_journey(client, authenticated, verify_driver(client, authenticated))
    tid = request(client, authenticated, jid).json()["id"]
    assert request(client, authenticated, jid).json()["id"] == tid
    assert [(a.event, a.owner) for a in rows(client)] == [("seat_requested", driver_key)]
    assert "#/trips?view=driving" in rows(client)[0].payload["text"]
    path = f"/v1/journeys/{jid}/tickets/{tid}"
    assert client.get(path + "/notifications", headers=rider).json() == []
    for _ in range(2):
        decision = client.post(path + "/" + action, headers=driver)
        assert decision.is_success, decision.text
    alerts = rows(client)
    assert len(alerts) == 2
    rider_alert = next(a for a in alerts if a.event == event)
    assert rider_alert.owner == OWNER and "#/checkout/" in rider_alert.payload["text"]
    assert [a["event"] for a in client.get(path + "/notifications", headers=rider).json()] == [
        event
    ]
    assert outbox.claim(client.app.state.engine, datetime.now(UTC)).state == "suppressed"
    if action == "approve":
        with Session(client.app.state.engine) as session, session.begin():
            session.get(Ticket, tid).expires = datetime.now(UTC) - timedelta(seconds=1)
        assert outbox.claim(client.app.state.engine, datetime.now(UTC)).state == "expired"
    else:
        assert outbox.claim(client.app.state.engine, datetime.now(UTC)).state == "sending"
        assert client.get(f"/v1/journeys/{jid}", headers=rider).json()["tickets"][0]["declined"]
    with Session(client.app.state.engine) as session:
        assert session.scalar(select(PaymentEntry.ticket_id)) is None


@pytest.mark.parametrize(
    "approve,cancel_ride", [(False, False), (True, False), (False, True), (True, True)]
)
def test_driver_cancellation_notifies_unpaid_approval_rider_once(
    client, authenticated, providers, approve, cancel_ride
):
    from tests.test_v2 import create_approval_journey, request, verify_driver

    contact(client, phone="none")
    jid = create_approval_journey(client, authenticated, verify_driver(client, authenticated))
    tid = request(client, authenticated, jid).json()["id"]
    path = f"/v1/journeys/{jid}"
    ticket = path + "/tickets/" + tid
    if approve:
        assert client.post(ticket + "/approve", headers=authenticated()).is_success
    for _ in range(2):
        assert client.post(
            (path if cancel_ride else ticket) + "/cancel", headers=authenticated()
        ).is_success
    rider = authenticated(subject="passenger")
    alerts = client.get(ticket + "/notifications", headers=rider).json()
    assert [r["event"] for r in alerts] == (["seat_approved"] if approve else []) + [
        "request_cancelled"
    ]
    assert client.post(ticket + "/decline", headers=authenticated()).status_code == 409
    assert client.get(path, headers=rider).json()["tickets"][0]["declined"] is False
