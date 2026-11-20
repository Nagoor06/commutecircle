"""Opt-in, device-bound message push. Never put conversation text in a notification."""

import asyncio
import base64
import hashlib
import json
import logging
import os
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit
from uuid import uuid4

import requests
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException
from pywebpush import WebPushException, webpush
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.chat import ChatRead, Message
from app.models.journey import Journey, Ticket
from app.models.push import PushDelivery, PushSubscription
from app.services import chat
from app.services.notification_preferences import owner_key, utc

logger = logging.getLogger(__name__)


def configured():
    return bool(
        os.getenv("VAPID_PRIVATE_KEY")
        and os.getenv("VAPID_PUBLIC_KEY")
        and os.getenv("VAPID_SUBJECT")
    )


def valid_subscription(endpoint, keys):
    try:
        url = urlsplit(endpoint)
        port = url.port
    except ValueError as exc:
        raise HTTPException(422, "Invalid browser push endpoint.") from exc
    host = url.hostname or ""
    allowed = host in {
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
    }
    allowed |= host.endswith(".push.apple.com") or host.endswith(".notify.windows.com")
    if (
        not allowed
        or url.scheme != "https"
        or port not in (None, 443)
        or url.username
        or url.password
        or url.fragment
        or not url.path
        or any(c.isspace() for c in endpoint)
    ):
        raise HTTPException(422, "Use a subscription created by a supported browser.")
    try:
        public = base64.urlsafe_b64decode(keys.p256dh + "=" * (-len(keys.p256dh) % 4))
        auth = base64.urlsafe_b64decode(keys.auth + "=" * (-len(keys.auth) % 4))
        if len(public) != 65 or len(auth) != 16:
            raise ValueError("Invalid key length")
        ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), public)
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, "Invalid browser subscription keys.") from exc


def subscribe(session, principal, data):
    if not configured():
        raise HTTPException(
            503, "Phone notifications are not configured yet. In-app alerts still work."
        )
    valid_subscription(data.endpoint, data.keys)
    key = hashlib.sha256(data.endpoint.encode()).hexdigest()
    owner = owner_key(principal.issuer, principal.subject)
    now = datetime.now(UTC)
    with session.begin():
        row = session.scalar(
            select(PushSubscription).where(PushSubscription.id == key).with_for_update()
        )
        if row is None or row.owner != owner:
            if (
                session.scalar(
                    select(func.count())
                    .select_from(PushSubscription)
                    .where(PushSubscription.owner == owner)
                )
                >= 10
            ):
                raise HTTPException(409, "Notifications are already enabled on ten devices.")
        if row is None:
            try:
                with session.begin_nested():
                    session.add(
                        PushSubscription(
                            id=key,
                            owner=owner,
                            endpoint=data.endpoint,
                            p256dh=data.keys.p256dh,
                            auth=data.keys.auth,
                            binding=str(data.binding),
                            updated=now,
                        )
                    )
                    session.flush()
            except IntegrityError:
                pass
            row = session.scalar(
                select(PushSubscription).where(PushSubscription.id == key).with_for_update()
            )
        # A browser may switch accounts. Old queued notifications carry the old binding
        # and will be suppressed both here and by the service worker.
        row.owner, row.endpoint = owner, data.endpoint
        row.p256dh, row.auth = data.keys.p256dh, data.keys.auth
        row.binding, row.updated = str(data.binding), now
    return {"enabled": True}


def unsubscribe(session, principal, endpoint):
    key = hashlib.sha256(endpoint.encode()).hexdigest()
    with session.begin():
        session.execute(
            update(PushSubscription)
            .where(
                PushSubscription.id == key,
                PushSubscription.owner == owner_key(principal.issuer, principal.subject),
            )
            .values(
                owner="",
                endpoint="",
                p256dh="",
                auth="",
                binding=str(uuid4()),
                updated=datetime.now(UTC),
            )
        )
    return {"enabled": False}


def enqueue(session, j, t, message):
    owner = (
        owner_key(j.issuer, j.driver)
        if message.sender == "passenger"
        else owner_key(t.issuer, t.rider)
    )
    for sub in session.scalars(
        select(PushSubscription).where(
            PushSubscription.owner == owner,
            PushSubscription.updated > message.created_at - timedelta(days=90),
        )
    ):
        session.add(
            PushDelivery(
                id=str(uuid4()),
                message_id=message.id,
                subscription_id=sub.id,
                binding=sub.binding,
                created=message.created_at,
                updated=message.created_at,
                available=message.created_at + timedelta(seconds=3),
            )
        )


def claim(engine, now):
    with Session(engine) as session, session.begin():
        session.execute(
            update(PushDelivery)
            .where(
                PushDelivery.state == "sending",
                PushDelivery.updated < now - timedelta(minutes=2),
            )
            .values(state="queued")
        )
        row = session.scalar(
            select(PushDelivery)
            .where(
                PushDelivery.state == "queued",
                PushDelivery.available <= now,
            )
            .order_by(PushDelivery.created, PushDelivery.id)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        if not row:
            return None
        sub = session.get(PushSubscription, row.subscription_id)
        msg = session.get(Message, row.message_id)
        ticket = session.get(Ticket, msg.ticket_id)
        journey = session.get(Journey, ticket.journey_id)
        role = "driver" if msg.sender == "passenger" else "passenger"
        owner = (
            owner_key(journey.issuer, journey.driver)
            if role == "driver"
            else owner_key(ticket.issuer, ticket.rider)
        )
        read = session.get(ChatRead, (ticket.id, role))
        seen = read and (utc(read.seen_at), read.message_id) >= (utc(msg.created_at), msg.id)
        if (
            not sub
            or sub.owner != owner
            or sub.binding != row.binding
            or seen
            or chat.closed(session, journey, ticket, now)
        ):
            row.state = "suppressed"
        elif now - utc(row.created) >= timedelta(hours=1) or row.attempts >= 5:
            row.state = "expired"
        else:
            row.state = "sending"
            row.attempts += 1
        row.updated = now
        if row.state != "sending":
            return {}
        return {
            "id": row.id,
            "attempts": row.attempts,
            "subscription_id": sub.id,
            "binding": sub.binding,
            "subscription": {
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            },
            "payload": {
                "binding": sub.binding,
                "message_id": msg.id,
                "title": "New CommuteCircle message",
                "body": "Open your private booking chat to reply.",
                "path": f"#/chat/{journey.id}/{ticket.id}",
                "tag": f"chat-{ticket.id}",
            },
        }


class NoRedirectSession(requests.Session):
    def post(self, url, *args, **kwargs):
        kwargs["allow_redirects"] = False
        return super().post(url, *args, **kwargs)


def deliver(job):
    try:
        with NoRedirectSession() as client:
            response = webpush(
                subscription_info=job["subscription"],
                data=json.dumps(job["payload"]),
                vapid_private_key=os.environ["VAPID_PRIVATE_KEY"],
                vapid_claims={"sub": os.environ["VAPID_SUBJECT"]},
                ttl=3600,
                timeout=10,
                requests_session=client,
                headers={
                    "Urgency": "high",
                    "Topic": hashlib.sha256(job["payload"]["tag"].encode()).hexdigest()[:32],
                },
            )
        return "accepted" if 200 <= response.status_code < 300 else "failed"
    except WebPushException as exc:
        status = exc.response.status_code if exc.response is not None else None
        if status in (404, 410):
            return "gone"
        return "retry" if status is None or status == 429 or status >= 500 else "failed"
    except requests.RequestException:
        return "retry"


def dispatch_batch(engine, maximum=10):
    if not configured():
        return
    for _ in range(maximum):
        job = claim(engine, datetime.now(UTC))
        if job is None:
            break
        if not job:
            continue
        outcome = deliver(job)
        now = datetime.now(UTC)
        with Session(engine) as session, session.begin():
            session.execute(
                update(PushDelivery)
                .where(
                    PushDelivery.id == job["id"],
                    PushDelivery.state == "sending",
                    PushDelivery.attempts == job["attempts"],
                )
                .values(
                    state="queued" if outcome == "retry" else outcome,
                    updated=now,
                    available=now + timedelta(seconds=15 * 2 ** job["attempts"]),
                )
            )
            if outcome == "gone":
                session.execute(
                    update(PushSubscription)
                    .where(
                        PushSubscription.id == job["subscription_id"],
                        PushSubscription.binding == job["binding"],
                    )
                    .values(
                        owner="", endpoint="", p256dh="", auth="", binding=str(uuid4()), updated=now
                    )
                )
    with Session(engine) as session, session.begin():
        session.execute(
            delete(PushDelivery).where(
                PushDelivery.created < datetime.now(UTC) - timedelta(days=30)
            )
        )
        session.execute(
            delete(PushSubscription).where(
                PushSubscription.updated < datetime.now(UTC) - timedelta(days=90),
                ~select(PushDelivery.id)
                .where(PushDelivery.subscription_id == PushSubscription.id)
                .exists(),
            )
        )


async def run(engine):
    while True:
        try:
            await asyncio.to_thread(dispatch_batch, engine)
        except Exception:
            # Provider exceptions may contain endpoints or credentials. Do not log them.
            logger.warning("Message push dispatch failed; queued work will be retried")
        await asyncio.sleep(2)
