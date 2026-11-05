"""Participant-only inbox. A read acknowledges a message, never an unseen future time."""

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import and_, case, func, or_, select

from app.models.chat import ChatBlock, ChatRead, Message
from app.models.journey import Journey, Ticket
from app.services import chat, journeys


def inbox(session, principal, limit=20, offset=0, unread_only=False):
    driver = and_(Journey.issuer == principal.issuer, Journey.driver == principal.subject)
    rider = and_(Ticket.issuer == principal.issuer, Ticket.rider == principal.subject)
    role = case((driver, "driver"), else_="passenger")
    # Windowed previews avoid loading whole message histories for every booking.
    latest = select(
        Message.ticket_id,
        Message.text,
        Message.sender,
        Message.created_at,
        func.row_number()
        .over(
            partition_by=Message.ticket_id, order_by=(Message.created_at.desc(), Message.id.desc())
        )
        .label("position"),
    ).subquery()
    unread = (
        select(func.count())
        .select_from(Message)
        .where(
            Message.ticket_id == Ticket.id,
            Message.sender != role,
            or_(
                ChatRead.seen_at.is_(None),
                Message.created_at > ChatRead.seen_at,
                and_(Message.created_at == ChatRead.seen_at, Message.id > ChatRead.message_id),
            ),
        )
        .correlate(Ticket, Journey, ChatRead)
        .scalar_subquery()
    )
    blocked = select(ChatBlock.ticket_id).where(ChatBlock.ticket_id == Ticket.id).exists()
    query = (
        select(
            Ticket, Journey, latest.c.text, latest.c.sender, latest.c.created_at, unread, blocked
        )
        .join(Journey, Ticket.journey_id == Journey.id)
        .outerjoin(latest, and_(latest.c.ticket_id == Ticket.id, latest.c.position == 1))
        .outerjoin(ChatRead, and_(ChatRead.ticket_id == Ticket.id, ChatRead.role == role))
        .where(Ticket.charged > 0, or_(driver, rider))
    )
    if unread_only:
        query = query.where(unread > 0)
    rows = session.execute(
        query.order_by(func.coalesce(latest.c.created_at, Journey.departure).desc(), Ticket.id)
        .offset(offset)
        .limit(limit + 1)
    ).all()
    now = datetime.now(UTC)
    items = []
    for t, j, text, sender, sent_at, count, is_blocked in rows[:limit]:
        items.append(
            {
                "ticket_id": t.id,
                "journey_id": j.id,
                "role": "driver" if journeys.is_driver(j, principal) else "passenger",
                "origin": j.stops[t.board]["name"],
                "destination": j.stops[t.alight]["name"],
                "pickup_at": journeys.pickup(j, t.board),
                "state": t.state,
                "closed": bool(
                    is_blocked
                    or j.cancelled
                    or t.state not in ("paid", "exited")
                    or now >= journeys.pickup(j, t.alight) + timedelta(hours=24)
                ),
                "preview": text,
                "sender": sender,
                "last_message_at": journeys.utc(sent_at) if sent_at else None,
                "unread": count,
            }
        )
    return {"items": items, "has_more": len(rows) > limit}


def mark_read(session, jid, tid, principal, message_id):
    with session.begin():
        _, _, role = chat.participants(session, jid, tid, principal, lock=True)
        message = session.get(Message, message_id)
        if not message or message.ticket_id != tid:
            raise HTTPException(404, "Message not found")
        previous = session.get(ChatRead, (tid, role))
        # Uses the same journey lock as sending, blocking and cancellation. Reordered
        # acknowledgements across devices cannot move the cursor backwards.
        if not previous or (journeys.utc(message.created_at), message.id) > (
            journeys.utc(previous.seen_at),
            previous.message_id,
        ):
            session.merge(
                ChatRead(
                    ticket_id=tid, role=role, message_id=message.id, seen_at=message.created_at
                )
            )
    return {"read": True}
