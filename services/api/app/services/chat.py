"""Booking-scoped chat. No phone directory, public handles or attachment uploads."""

import re
import unicodedata
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select

from app.models.chat import ChatBlock, Message
from app.models.journey import Journey, Ticket
from app.services import journeys

NUMBER_WORDS = re.compile(r"\b(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)\b", re.I)
CONTACT = re.compile(
    r"@|https?\s*:|www\s*\.|\b[\w-]+\s*(?:\.|\[dot\]|\(dot\))\s*(?:com|in|net|org|me|io)\b|whats\s*app|telegram|instagram|snapchat",
    re.I,
)


def normalized(text):
    return "".join(
        c
        for c in unicodedata.normalize("NFKC", text)
        if not unicodedata.category(c).startswith("C")
    )


def check_text(text, recent=()):
    clean = normalized(text).strip()
    if not clean:
        raise HTTPException(422, "Write a pickup or journey message.")
    # Check each message and consecutive short fragments, including split-number attempts.
    combined = " ".join([*recent, clean])
    digits = sum(c.isdecimal() for c in combined)
    words = len(NUMBER_WORDS.findall(combined))
    if CONTACT.search(clean) or digits + words >= 7:
        raise HTTPException(
            422,
            "Keep contact details private. Phone numbers, emails, contact handles and links "
            "are not allowed. Use a public landmark or a quick reply.",
        )
    return clean


def participants(session, jid, tid, principal, lock=False):
    j = journeys.locked(session, jid) if lock else session.get(Journey, jid)
    t = session.get(Ticket, tid)
    if (
        not j
        or not t
        or t.journey_id != jid
        or not (journeys.is_driver(j, principal) or journeys.is_rider(t, principal))
    ):
        raise HTTPException(404, "Conversation not found")
    if not t.charged:
        raise HTTPException(409, "Chat opens after a confirmed booking.")
    return j, t, "driver" if journeys.is_driver(j, principal) else "passenger"


def closed(session, j, t, now):
    return bool(
        j.cancelled
        or t.state not in ("paid", "exited")
        or now >= journeys.pickup(j, t.alight) + timedelta(hours=24)
        or session.scalar(select(ChatBlock.ticket_id).where(ChatBlock.ticket_id == t.id).limit(1))
    )


def view(message):
    return dict(
        id=message.id,
        sender=message.sender,
        text=message.text,
        created_at=journeys.utc(message.created_at),
    )


def read(session, jid, tid, principal):
    j, t, role = participants(session, jid, tid, principal)
    rows = list(
        session.scalars(
            select(Message)
            .where(Message.ticket_id == tid)
            .order_by(Message.created_at.desc(), Message.id.desc())
            .limit(100)
        )
    )
    return {
        "role": role,
        "closed": closed(session, j, t, datetime.now(UTC)),
        "messages": [view(m) for m in reversed(rows)],
    }


def send(session, jid, tid, principal, data):
    with session.begin():
        j, t, role = participants(session, jid, tid, principal, lock=True)
        prior = session.get(Message, str(data.message_id))
        if prior:
            if (
                prior.ticket_id == tid
                and prior.sender == role
                and prior.text == normalized(data.text).strip()
            ):
                return view(prior)
            raise HTTPException(409, "Message ID already used")
        now = datetime.now(UTC)
        if closed(session, j, t, now):
            raise HTTPException(
                409, "This chat is closed. Your booking and receipt remain available."
            )
        recent = list(
            session.scalars(
                select(Message)
                .where(
                    Message.ticket_id == tid,
                    Message.sender == role,
                    Message.created_at > now - timedelta(seconds=30),
                )
                .order_by(Message.created_at)
            )
        )
        if len(recent) >= 5:
            raise HTTPException(429, "Please wait a few seconds before sending more messages.")
        clean = check_text(data.text, [m.text for m in recent if len(m.text) <= 20])
        if (
            session.scalar(
                select(func.count()).select_from(Message).where(Message.ticket_id == tid)
            )
            >= 200
        ):
            raise HTTPException(409, "This booking has reached its message limit.")
        message = Message(
            id=str(data.message_id), ticket_id=tid, sender=role, text=clean, created_at=now
        )
        session.add(message)
        session.flush()
        return view(message)


def block(session, jid, tid, principal):
    with session.begin():
        _, _, role = participants(session, jid, tid, principal, lock=True)
        session.merge(ChatBlock(ticket_id=tid, role=role))
    return {"closed": True}
