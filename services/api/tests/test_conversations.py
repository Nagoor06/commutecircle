from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy.orm import Session
from test_private_chat import conversation

from app.models import ChatRead, Journey, Message, Ticket

INBOX = "/v1/me/conversations"


def send(client, path, headers, text):
    response = client.post(
        path + "/messages", headers=headers, json={"message_id": str(uuid4()), "text": text}
    )
    response.raise_for_status()
    return response.json()


def test_inbox_only_paid_participant_conversations(client, authenticated):
    base, path, rider = conversation(client, authenticated)
    assert client.get(INBOX).status_code == 401
    assert client.get(INBOX, headers=rider).json()["items"] == []
    client.post(path + "/sandbox-pay", headers=rider).raise_for_status()
    message = send(client, path, rider, "At the public entrance.")
    for headers, role, unread in [(rider, "passenger", 0), (authenticated(), "driver", 1)]:
        response = client.get(INBOX, headers=headers)
        assert response.headers["cache-control"] == "no-store"
        row = response.json()["items"][0]
        assert row["ticket_id"] == path.split("/")[-1]
        assert row["journey_id"] == base.split("/")[-1]
        assert row["role"] == role
        assert row["unread"] == unread
        assert row["preview"] == message["text"]
        assert row["sender"] == "passenger"
        assert not row["closed"]
        assert not {"issuer", "driver", "rider", "employer"} & row.keys()
    assert client.get(INBOX, headers=authenticated(subject="stranger")).json()["items"] == []
    with Session(client.app.state.engine) as session:
        session.get(Ticket, path.split("/")[-1]).issuer = "https://other-issuer.example"
        session.commit()
    assert client.get(INBOX, headers=rider).json()["items"] == []


def test_read_cursor_does_not_acknowledge_later_messages_or_move_backwards(client, authenticated):
    _, path, rider = conversation(client, authenticated)
    client.post(path + "/sandbox-pay", headers=rider).raise_for_status()
    first = send(client, path, rider, "Waiting by the entrance.")
    second = send(client, path, rider, "Next to the ticket counter.")
    assert (
        client.get(INBOX + "?unread_only=true", headers=authenticated()).json()["items"][0][
            "unread"
        ]
        == 2
    )

    def ack(message):
        return client.post(
            path + "/messages/read", headers=authenticated(), json={"message_id": message["id"]}
        )

    ack(first).raise_for_status()
    assert client.get(INBOX, headers=authenticated()).json()["items"][0]["unread"] == 1
    ack(second).raise_for_status()
    ack(first).raise_for_status()
    assert client.get(INBOX + "?unread_only=true", headers=authenticated()).json()["items"] == []
    third = send(client, path, rider, "I see your car.")
    ack(second).raise_for_status()
    assert client.get(INBOX, headers=authenticated()).json()["items"][0]["unread"] == 1
    with Session(client.app.state.engine) as session:
        assert session.get(ChatRead, (path.split("/")[-1], "driver")).message_id == second["id"]
    assert (
        client.post(
            path + "/messages/read",
            headers=authenticated(subject="stranger"),
            json={"message_id": third["id"]},
        ).status_code
        == 404
    )
    assert (
        client.post(
            path + "/messages/read", headers=authenticated(), json={"message_id": str(uuid4())}
        ).status_code
        == 404
    )


def test_inbox_pagination_sorting_and_closed_history(client, authenticated):
    first_base, first_path, first_rider = conversation(client, authenticated)
    client.post(first_path + "/sandbox-pay", headers=first_rider).raise_for_status()
    first = send(client, first_path, first_rider, "At the first pickup.")
    second_base, second_path, second_rider = conversation(client, authenticated)
    client.post(second_path + "/sandbox-pay", headers=second_rider).raise_for_status()
    send(client, second_path, second_rider, "At the second pickup.")
    page = client.get(INBOX + "?limit=1", headers=authenticated()).json()
    assert page["has_more"]
    assert page["items"][0]["ticket_id"] == second_path.split("/")[-1]
    page2 = client.get(INBOX + "?limit=1&offset=1", headers=authenticated()).json()
    assert not page2["has_more"]
    assert page2["items"][0]["ticket_id"] == first_path.split("/")[-1]
    assert (
        client.post(
            second_path + "/messages/read",
            headers=authenticated(),
            json={"message_id": first["id"]},
        ).status_code
        == 404
    )
    client.post(first_path + "/messages/block", headers=first_rider).raise_for_status()
    client.post(second_base + "/cancel", headers=authenticated()).raise_for_status()
    rows = client.get(INBOX, headers=authenticated()).json()["items"]
    assert all(row["closed"] for row in rows)
    assert len(rows) == 2
    assert client.get(INBOX + "?limit=51", headers=authenticated()).status_code == 422
    assert client.get(INBOX + "?offset=-1", headers=authenticated()).status_code == 422


def test_chat_read_order_ties_and_expired_conversation(client, authenticated):
    base, path, rider = conversation(client, authenticated)
    client.post(path + "/sandbox-pay", headers=rider).raise_for_status()
    sent = [send(client, path, rider, text) for text in ["At the gate.", "By the sign."]]
    same_time = datetime.now(UTC)
    ids = sorted(item["id"] for item in sent)
    with Session(client.app.state.engine) as session:
        for mid in ids:
            session.get(Message, mid).created_at = same_time
        session.get(Journey, base.split("/")[-1]).departure = datetime.now(UTC) - timedelta(days=2)
        session.commit()
    client.post(
        path + "/messages/read", headers=authenticated(), json={"message_id": ids[0]}
    ).raise_for_status()
    row = client.get(INBOX, headers=authenticated()).json()["items"][0]
    assert row["unread"] == 1 and row["closed"]
    client.post(
        path + "/messages/read", headers=authenticated(), json={"message_id": ids[1]}
    ).raise_for_status()
    assert client.get(INBOX, headers=authenticated()).json()["items"][0]["unread"] == 0
