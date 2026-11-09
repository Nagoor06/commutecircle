import hashlib
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models.notification import NotificationPreference, VerificationLimit
from app.services import notification_providers as provider


def owner_key(issuer, subject):
    return hashlib.sha256((issuer + "\0" + subject).encode()).hexdigest()


def utc(value):
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def get_locked(session, model, key, **defaults):
    # Concurrent first use must not create two preferences/rate-limit buckets.
    column = model.owner if model is NotificationPreference else model.key
    row = session.scalar(select(model).where(column == key).with_for_update())
    if row is None:
        try:
            with session.begin_nested():
                session.add(model(**{column.key: key}, **defaults))
                session.flush()
        except IntegrityError:
            pass
        row = session.scalar(select(model).where(column == key).with_for_update())
    return row


def view(pref):
    return {
        "email": pref.email if pref else None,
        "email_enabled": pref.email_enabled if pref else False,
        "phone": pref.phone if pref else None,
        "phone_channel": pref.phone_channel if pref else "none",
        "available": provider.configured(),
    }


def update(session, key, data):
    with session.begin():
        pref = get_locked(session, NotificationPreference, key)
        if data.email_enabled and not pref.email:
            raise HTTPException(409, "Connect your verified sign-in email first.")
        if data.phone_channel != "none" and not pref.phone:
            raise HTTPException(409, "Verify your phone number first.")
        pref.email_enabled, pref.phone_channel = data.email_enabled, data.phone_channel
        pref.consent_at = datetime.now(UTC)
        return view(pref)


def connect_email(session, key, issuer, subject, token):
    try:
        email = provider.verified_email(issuer, subject, token)
    except ValueError as exc:
        raise HTTPException(
            409, "Verify your sign-in email, then sign out and sign in again with email access."
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(503, "Could not verify your email. Sign in again and retry.") from exc
    with session.begin():
        pref = get_locked(session, NotificationPreference, key)
        pref.email, pref.email_enabled = email, True
        pref.consent_at = datetime.now(UTC)
        return view(pref)


def start_phone(session, key, phone):
    if not provider.configured()["verification"]:
        raise HTTPException(503, "Phone alerts are awaiting provider setup.")
    now, challenge = datetime.now(UTC), str(uuid4())
    with session.begin():
        pref = get_locked(session, NotificationPreference, key)
        phone_key = hashlib.sha256(phone.encode()).hexdigest()
        for bucket, maximum in (("global", 100), ("owner:" + key, 3), ("phone:" + phone_key, 3)):
            limit = get_locked(session, VerificationLimit, bucket, window=now, last=now, count=0)
            if now - utc(limit.window) >= timedelta(days=1):
                limit.window, limit.count = now, 0
            if limit.count >= maximum or (
                bucket != "global" and limit.count and now - utc(limit.last) < timedelta(seconds=60)
            ):
                raise HTTPException(429, "Verification limit reached. Please try again later.")
            limit.count += 1
            limit.last = now
        pref.pending_phone, pref.challenge = phone, challenge
        pref.verification_sid = None
        pref.verification_expires = now + timedelta(minutes=10)
        pref.verification_attempts = 0
    # Persist budgets BEFORE the external send, including uncertain/failed sends.
    try:
        data = provider.verification("Verifications", {"To": phone, "Channel": "sms"})
        sid = data.get("sid", "")
        if not isinstance(sid, str) or len(sid) != 34 or not sid.startswith("VE"):
            raise ValueError()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            503, "Code delivery could not be confirmed. Wait before retrying."
        ) from exc
    with session.begin():
        pref = get_locked(session, NotificationPreference, key)
        if pref.challenge != challenge:
            raise HTTPException(409, "A newer verification has replaced this code.")
        pref.verification_sid = sid
    return {"status": "code_requested"}


def check_phone(session, key, code):
    if not provider.configured()["verification"]:
        raise HTTPException(503, "Phone verification is unavailable.")
    with session.begin():
        pref = get_locked(session, NotificationPreference, key)
        if (
            not pref.verification_sid
            or utc(pref.verification_expires) <= datetime.now(UTC)
            or pref.verification_attempts >= 5
        ):
            raise HTTPException(409, "Request a new code to verify your number.")
        pref.verification_attempts += 1
        sid, challenge, phone = pref.verification_sid, pref.challenge, pref.pending_phone
    try:
        result = provider.verification("VerificationCheck", {"VerificationSid": sid, "Code": code})
        approved = result.get("status") == "approved" and result.get("to") == phone
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(409, "Code could not be verified. Check it and try again.") from exc
    with session.begin():
        pref = get_locked(session, NotificationPreference, key)
        if not approved or pref.challenge != challenge or pref.verification_sid != sid:
            raise HTTPException(409, "Code is incorrect, expired or already used.")
        pref.phone, pref.phone_channel = phone, "none"
        pref.verification_sid = pref.pending_phone = pref.challenge = None
        pref.verification_expires = None
        return view(pref)
