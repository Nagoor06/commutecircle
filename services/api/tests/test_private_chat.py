from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session
from test_journeys import listing

from app.models import Journey


def conversation(client, authenticated):
    base = listing(client, authenticated)
    rider = authenticated(subject="rider")
    t = client.post(
        base + "/holds", headers=rider, json={"board": 0, "alight": 1, "checkout_id": str(uuid4())}
    ).json()
    return base, base + "/tickets/" + t["id"], rider


def test_chat_ownership_retry_rate_limit_and_block(client, authenticated):
    base, path, rider = conversation(client, authenticated)
    assert client.get(path + "/messages", headers=rider).status_code == 409
    assert client.post(path + "/sandbox-pay", headers=rider).is_success
    assert client.get(path + "/messages").status_code == 401
    assert (
        client.get(path + "/messages", headers=authenticated(subject="stranger")).status_code == 404
    )
    data = {"message_id": str(uuid4()), "text": "At the public entrance."}
    for _ in range(2):
        assert client.post(path + "/messages", headers=rider, json=data).is_success
    assert len(client.get(path + "/messages", headers=authenticated()).json()["messages"]) == 1
    assert client.post(path + "/messages", headers=authenticated(), json=data).status_code == 409
    for _ in range(4):
        assert client.post(
            path + "/messages", headers=rider, json=data | {"message_id": str(uuid4())}
        ).is_success
    assert (
        client.post(
            path + "/messages", headers=rider, json=data | {"message_id": str(uuid4())}
        ).status_code
        == 429
    )
    assert client.post(path + "/messages/block", headers=rider).is_success
    assert client.get(path + "/messages", headers=authenticated()).json()["closed"]
    assert (
        client.post(
            path + "/messages", headers=authenticated(), json=data | {"message_id": str(uuid4())}
        ).status_code
        == 409
    )
    assert not client.get(base, headers=rider).json()["cancelled"]


@pytest.mark.parametrize(
    "text",
    [
        "Call 98765 43210",
        "９８７６５４３２１０",
        "9\u200b876543210",
        "nine eight seven six five four three two one zero",
        "hello@example.com",
        "visit example [dot] com",
        "https://example.org",
        "message @someone",
        "WhatsApp me",
    ],
)
def test_chat_blocks_common_contact_disclosure(client, authenticated, text):
    _, path, rider = conversation(client, authenticated)
    client.post(path + "/sandbox-pay", headers=rider).raise_for_status()
    assert (
        client.post(
            path + "/messages", headers=rider, json={"message_id": str(uuid4()), "text": text}
        ).status_code
        == 422
    )
    assert client.get(path + "/messages", headers=rider).json()["messages"] == []


def test_split_digits_chat_expiry_and_cancelled_chat(client, authenticated):
    base, path, rider = conversation(client, authenticated)
    client.post(path + "/sandbox-pay", headers=rider).raise_for_status()

    def send(text):
        return client.post(
            path + "/messages", headers=rider, json={"message_id": str(uuid4()), "text": text}
        )

    assert send("9876").is_success
    assert send("543210").status_code == 422
    assert send("I’ll arrive in five minutes.").is_success
    with Session(client.app.state.engine) as session:
        session.get(Journey, base.split("/")[-1]).departure = datetime.now(UTC) - timedelta(days=2)
        session.commit()
    assert client.get(path + "/messages", headers=rider).json()["closed"]
    assert send("Hello").status_code == 409
