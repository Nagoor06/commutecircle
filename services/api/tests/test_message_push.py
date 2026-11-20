import base64
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
import requests
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from pywebpush import WebPushException
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_private_chat import conversation

from app.models import Message, PushDelivery, PushSubscription
from app.services import message_push

PUSH = "/v1/me/push"
SUMMARY = "/v1/me/conversations/summary"


@pytest.fixture
def subscription(monkeypatch):
    for key in ("VAPID_PRIVATE_KEY", "VAPID_PUBLIC_KEY", "VAPID_SUBJECT"):
        monkeypatch.setenv(key, "configured-test-value")
    key = (
        ec.generate_private_key(ec.SECP256R1())
        .public_key()
        .public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    )
    return {
        "endpoint": "https://fcm.googleapis.com/fcm/send/test-device",
        "keys": {
            "p256dh": base64.urlsafe_b64encode(key).decode().rstrip("="),
            "auth": base64.urlsafe_b64encode(b"0123456789abcdef").decode().rstrip("="),
        },
        "binding": str(uuid4()),
    }


def queue(client, authenticated, subscription):
    client.put(PUSH, headers=authenticated(), json=subscription).raise_for_status()
    base, path, rider = conversation(client, authenticated)
    client.post(path + "/sandbox-pay", headers=rider).raise_for_status()
    data = {"message_id": str(uuid4()), "text": "At the public entrance."}
    for _ in range(2):
        client.post(path + "/messages", headers=rider, json=data).raise_for_status()
    return base, path, rider, data


def test_push_configuration_permission_validation_and_revocation(
    client, authenticated, subscription, monkeypatch
):
    assert client.get(PUSH).status_code == 401
    assert (
        client.put(PUSH, headers=authenticated(scope="rides:read"), json=subscription).status_code
        == 403
    )
    response = client.get(PUSH, headers=authenticated())
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["available"]
    public = client.get("/v1/studio-config").json()
    assert public["message_push_available"] is True
    assert "configured-test-value" not in str(public)
    monkeypatch.delenv("VAPID_PRIVATE_KEY")
    assert not client.get(PUSH, headers=authenticated()).json()["available"]
    assert client.put(PUSH, headers=authenticated(), json=subscription).status_code == 503
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "configured-test-value")
    client.put(PUSH, headers=authenticated(), json=subscription).raise_for_status()
    client.request(
        "DELETE",
        PUSH,
        headers=authenticated(subject="stranger"),
        json={"endpoint": subscription["endpoint"]},
    ).raise_for_status()
    with Session(client.app.state.engine) as session:
        assert session.scalar(select(PushSubscription)).endpoint == subscription["endpoint"]
    client.request(
        "DELETE", PUSH, headers=authenticated(), json={"endpoint": subscription["endpoint"]}
    ).raise_for_status()
    with Session(client.app.state.engine) as session:
        row = session.scalar(select(PushSubscription))
        assert row.owner == row.endpoint == row.p256dh == row.auth == ""


@pytest.mark.parametrize(
    "endpoint",
    [
        "http://fcm.googleapis.com/send/x",
        "https://127.0.0.1/send/x",
        "https://evil.example/send/x",
        "https://fcm.googleapis.com.evil.example/send/x",
        "https://fcm.googleapis.com:123/send/x",
        "https://fcm.googleapis.com:bad/send/x",
        "https://user:pass@fcm.googleapis.com/send/x",
        "https://fcm.googleapis.com/send/x#fragment",
        "https://fcm.googleapis.com/send/x\n",
    ],
)
def test_push_endpoints_cannot_target_arbitrary_servers(
    client, authenticated, subscription, endpoint
):
    assert (
        client.put(
            PUSH, headers=authenticated(), json=subscription | {"endpoint": endpoint}
        ).status_code
        == 422
    )


def test_push_rejects_invalid_keys_and_limits_devices(client, authenticated, subscription):
    invalid = subscription | {"keys": subscription["keys"] | {"p256dh": "A" * 87}}
    assert client.put(PUSH, headers=authenticated(), json=invalid).status_code == 422
    for index in range(10):
        data = subscription | {"endpoint": subscription["endpoint"] + str(index)}
        client.put(PUSH, headers=authenticated(), json=data).raise_for_status()
    assert client.put(PUSH, headers=authenticated(), json=subscription).status_code == 409
    client.put(PUSH, headers=authenticated(subject="other"), json=subscription).raise_for_status()
    assert client.put(PUSH, headers=authenticated(), json=subscription).status_code == 409


def test_message_queue_is_idempotent_and_contains_no_private_preview(
    client, authenticated, subscription
):
    _, _, _, data = queue(client, authenticated, subscription)
    with Session(client.app.state.engine) as session:
        assert len(list(session.scalars(select(PushDelivery)))) == 1
    job = message_push.claim(client.app.state.engine, datetime.now(UTC) + timedelta(seconds=5))
    assert job["payload"]["message_id"] == data["message_id"]
    assert job["payload"]["binding"] == subscription["binding"]
    assert "text" not in job["payload"] and data["text"] not in str(job["payload"])
    assert (
        message_push.claim(client.app.state.engine, datetime.now(UTC) + timedelta(seconds=5))
        is None
    )


@pytest.mark.parametrize(
    "reason", ["read", "blocked", "cancelled", "signed_out", "account_switch", "expired"]
)
def test_queued_push_suppressed_after_relevant_changes(client, authenticated, subscription, reason):
    base, path, rider, data = queue(client, authenticated, subscription)
    now = datetime.now(UTC) + timedelta(seconds=5)
    if reason == "read":
        client.post(
            path + "/messages/read",
            headers=authenticated(),
            json={"message_id": data["message_id"]},
        ).raise_for_status()
    elif reason == "blocked":
        client.post(path + "/messages/block", headers=rider).raise_for_status()
    elif reason == "cancelled":
        client.post(base + "/cancel", headers=authenticated()).raise_for_status()
    elif reason == "signed_out":
        client.request(
            "DELETE", PUSH, headers=authenticated(), json={"endpoint": subscription["endpoint"]}
        ).raise_for_status()
    elif reason == "account_switch":
        client.put(
            PUSH,
            headers=authenticated(subject="other"),
            json=subscription | {"binding": str(uuid4())},
        ).raise_for_status()
    else:
        now += timedelta(hours=1)
    assert message_push.claim(client.app.state.engine, now) == {}
    with Session(client.app.state.engine) as session:
        assert session.scalar(select(PushDelivery)).state == (
            "expired" if reason == "expired" else "suppressed"
        )


def test_summary_counts_beyond_preview_limit_and_excludes_self_strangers_and_blocked(
    client, authenticated
):
    _, path, rider = conversation(client, authenticated)
    client.post(path + "/sandbox-pay", headers=rider).raise_for_status()
    now = datetime.now(UTC)
    with Session(client.app.state.engine) as session, session.begin():
        for index in range(25):
            session.add(
                Message(
                    id=str(uuid4()),
                    ticket_id=path.split("/")[-1],
                    sender="passenger",
                    text="A private message",
                    created_at=now + timedelta(milliseconds=index),
                )
            )
    response = client.get(SUMMARY, headers=authenticated())
    assert response.headers["cache-control"] == "no-store"
    data = response.json()
    assert data["unread"] == 25 and len(data["items"]) == 20
    assert all("text" not in item and "preview" not in item for item in data["items"])
    assert client.get(SUMMARY, headers=rider).json()["unread"] == 0
    assert client.get(SUMMARY, headers=authenticated(subject="stranger")).json()["unread"] == 0
    client.post(path + "/messages/block", headers=rider).raise_for_status()
    assert client.get(SUMMARY, headers=authenticated()).json()["unread"] == 0


@pytest.mark.parametrize(
    "outcome,expected", [("accepted", "accepted"), ("retry", "queued"), ("gone", "gone")]
)
def test_dispatch_retries_and_removes_expired_endpoints(
    client, authenticated, subscription, monkeypatch, outcome, expected
):
    queue(client, authenticated, subscription)
    with Session(client.app.state.engine) as session, session.begin():
        session.scalar(select(PushDelivery)).available = datetime.now(UTC) - timedelta(seconds=1)
    monkeypatch.setattr(message_push, "deliver", lambda job: outcome)
    message_push.dispatch_batch(client.app.state.engine)
    with Session(client.app.state.engine) as session:
        row = session.scalar(select(PushDelivery))
        assert row.state == expected and row.attempts == 1
        assert bool(session.scalar(select(PushSubscription)).endpoint) == (outcome != "gone")


@pytest.mark.parametrize(
    "status,expected",
    [
        (201, "accepted"),
        (410, "gone"),
        (404, "gone"),
        (429, "retry"),
        (503, "retry"),
        (401, "failed"),
        (302, "failed"),
    ],
)
def test_provider_response_handling_without_real_messages(
    monkeypatch, subscription, status, expected
):
    def send(**kwargs):
        assert kwargs["timeout"] == 10 and kwargs["ttl"] == 3600
        if status >= 400:
            response = requests.Response()
            response.status_code = status
            raise WebPushException("redacted", response=response)
        return SimpleNamespace(status_code=status)

    monkeypatch.setattr(message_push, "webpush", send)
    assert (
        message_push.deliver({"subscription": subscription, "payload": {"tag": "booking"}})
        == expected
    )


def test_no_redirects_even_if_provider_responds_with_one(monkeypatch):
    captured = {}

    def post(self, url, *args, **kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(requests.Session, "post", post)
    with message_push.NoRedirectSession() as session:
        session.post("https://fcm.googleapis.com/send/x", allow_redirects=True)
    assert captured["allow_redirects"] is False
