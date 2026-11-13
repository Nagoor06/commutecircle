"""Transactional booking events, separately dispatched with bounded, safe retries."""

import asyncio
import logging
import os
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.models.journey import Ticket
from app.models.notification import Notification, NotificationPreference, VerificationLimit
from app.services import notification_providers as provider
from app.services.notification_preferences import owner_key, utc

logger = logging.getLogger(__name__)
LABELS = {
    "paid": "Booking confirmed",
    "driver_cancelled": "Driver cancelled your booking",
    "rider_cancelled": "Booking cancelled",
    "exited": "Journey segment completed",
    "request_cancelled": "The driver cancelled your seat request",
    "seat_requested": "A passenger requested a seat",
    "seat_approved": "Your seat request was approved",
    "seat_declined": "Your seat request was declined",
}
APPROVAL_STATES = {
    "request_cancelled": "driver_cancelled",
    "seat_requested": "requested",
    "seat_approved": "held",
    "seat_declined": "driver_cancelled",
}


def enqueue(session, journey, ticket, now, *, event=None):
    event = event or ticket.state
    if event not in APPROVAL_STATES and not ticket.charged and ticket.confirmed_at is None:
        return  # A seat hold is never a successful booking/payment confirmation.
    owner = (
        owner_key(journey.issuer, journey.driver)
        if event == "seat_requested"
        else owner_key(ticket.issuer, ticket.rider)
    )
    pref = session.get(NotificationPreference, owner)
    if not pref:
        return
    targets = []
    if pref.email and pref.email_enabled:
        targets.append(("email", pref.email))
    if pref.phone and pref.phone_channel != "none":
        targets.append((pref.phone_channel, pref.phone))
    departure = utc(journey.departure) + timedelta(minutes=journey.stops[ticket.board]["minutes"])
    when = departure.astimezone(ZoneInfo("Asia/Kolkata")).strftime("%d %b %Y, %I:%M %p IST")
    reference = ticket.id[:8].upper()
    label = LABELS[event]
    origin, destination = journey.stops[ticket.board]["name"], journey.stops[ticket.alight]["name"]
    amount = f"INR {(ticket.charged - ticket.refund) / 100:.2f}"
    refund = f"INR {ticket.refund / 100:.2f}"
    studio = os.getenv("PUBLIC_STUDIO_URL") or "http://localhost:8000/studio/"
    path = (
        "trips?view=driving" if event == "seat_requested" else f"checkout/{journey.id}/{ticket.id}"
    )
    link = f"{studio.rstrip('/')}/#/{path}"
    if event == "seat_requested":
        details = "Open My trips to review the request. The passenger has not been charged."
    elif event == "seat_approved":
        deadline = (
            utc(ticket.expires).astimezone(ZoneInfo("Asia/Kolkata")).strftime("%d %b, %I:%M %p IST")
        )
        details = f"Complete sandbox checkout before {deadline} to keep your seat."
    elif event == "request_cancelled":
        details = "Your request closed before payment. Open your receipt to find another ride."
    elif event == "seat_declined":
        details = "No seat was booked. Open your request to find another ride."
    else:
        details = f"Sandbox net fare: {amount}; sandbox refund: {refund}.\nNo real money was taken."
    text = (
        f"CommuteCircle — {label}\nReference: {reference}\n"
        f"{origin} → {destination}\nPickup: {when}\n"
        f"{details}\nSign in: {link}\nManage booking alerts in My profile."
    )
    ready = provider.configured()
    for channel, recipient in targets:
        prior = session.scalar(
            select(Notification.id).where(
                Notification.ticket_id == ticket.id,
                Notification.event == event,
                Notification.channel == channel,
            )
        )
        if prior:
            continue
        sender = os.getenv(
            {
                "email": "NOTIFICATION_FROM_EMAIL",
                "sms": "TWILIO_SMS_SERVICE_SID",
                "whatsapp": "TWILIO_WHATSAPP_FROM",
            }[channel],
            "",
        )
        session.add(
            Notification(
                ticket_id=ticket.id,
                owner=owner,
                event=event,
                channel=channel,
                recipient=recipient,
                created=now,
                updated=now,
                available=now,
                state="queued" if ready[channel] else "unavailable",
                payload={
                    "subject": f"CommuteCircle: {label} · {reference}",
                    "text": text,
                    "sender": sender,
                    "template": os.getenv("TWILIO_WHATSAPP_CONTENT_SID", ""),
                    "variables": {
                        "1": reference,
                        "2": label,
                        "3": origin,
                        "4": destination,
                        "5": when,
                        "6": amount,
                        "7": refund,
                        "8": link,
                    },
                },
            )
        )


def claim(engine, now):
    with Session(engine, expire_on_commit=False) as session, session.begin():
        # A crashed process may have sent a phone alert. Do not send it again.
        for channel in ("email", "sms", "whatsapp"):
            session.execute(
                update(Notification)
                .where(
                    Notification.state == "sending",
                    Notification.channel == channel,
                    Notification.updated < now - timedelta(minutes=2),
                )
                .values(state="queued" if channel == "email" else "unknown", updated=now)
            )
        row = session.scalar(
            select(Notification)
            .where(
                Notification.state == "queued",
                Notification.available <= now,
            )
            .order_by(Notification.created, Notification.id)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        if not row:
            return None
        pref, ticket = (
            session.get(NotificationPreference, row.owner),
            session.get(Ticket, row.ticket_id),
        )
        consent = pref and (
            (row.channel == "email" and pref.email_enabled and pref.email == row.recipient)
            or (
                row.channel != "email"
                and pref.phone_channel == row.channel
                and pref.phone == row.recipient
            )
        )
        expected = APPROVAL_STATES.get(row.event, row.event)
        if not consent or not ticket or ticket.state != expected:
            row.state = "suppressed"
        elif (
            (row.event in ("seat_requested", "seat_approved") and utc(ticket.expires) <= now)
            or now - utc(row.created) >= timedelta(hours=1)
            or row.attempts >= 5
        ):
            row.state = "expired"
        elif not provider.configured()[row.channel]:
            row.state = "unavailable"
        else:
            row.state = "sending"
            row.attempts += 1
        row.updated = now
        return row


def dispatch_batch(engine, maximum=10):
    for _ in range(maximum):
        row = claim(engine, datetime.now(UTC))
        if row is None:
            return
        if row.state != "sending":
            continue
        state, identifier = provider.send(row)
        now = datetime.now(UTC)
        with Session(engine) as session, session.begin():
            session.execute(
                update(Notification)
                .where(
                    Notification.id == row.id,
                    Notification.state == "sending",
                    Notification.attempts == row.attempts,
                )
                .values(
                    state="queued" if state == "retry" else state,
                    provider_id=identifier,
                    updated=now,
                    available=now + timedelta(seconds=30 * 2**row.attempts),
                )
            )


def purge(engine):
    now = datetime.now(UTC)
    with Session(engine) as session, session.begin():
        session.execute(
            update(Notification)
            .where(
                Notification.created < now - timedelta(days=30),
                Notification.recipient != "",
            )
            .values(recipient="", payload={})
        )
        session.execute(
            update(NotificationPreference)
            .where(
                NotificationPreference.verification_expires <= now,
            )
            .values(
                pending_phone=None,
                challenge=None,
                verification_sid=None,
                verification_expires=None,
                verification_attempts=0,
            )
        )
        session.execute(
            delete(VerificationLimit).where(VerificationLimit.window < now - timedelta(days=2))
        )


async def run(engine):
    while True:
        try:
            await asyncio.to_thread(dispatch_batch, engine)
            await asyncio.to_thread(purge, engine)
        except Exception:
            logger.warning("Booking alert dispatch failed; queued work will be checked again")
        await asyncio.sleep(10)
