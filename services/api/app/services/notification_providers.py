"""Bounded provider calls. Never log recipients, OTPs, access tokens or response bodies."""

import json
import os
import re

import httpx


def configured():
    twilio = bool(os.getenv("TWILIO_ACCOUNT_SID") and os.getenv("TWILIO_AUTH_TOKEN"))
    return {
        "email": bool(os.getenv("RESEND_API_KEY") and os.getenv("NOTIFICATION_FROM_EMAIL")),
        "sms": twilio and bool(os.getenv("TWILIO_SMS_SERVICE_SID")),
        "whatsapp": twilio
        and bool(os.getenv("TWILIO_WHATSAPP_FROM") and os.getenv("TWILIO_WHATSAPP_CONTENT_SID")),
        "verification": twilio and bool(os.getenv("TWILIO_VERIFY_SERVICE_SID")),
    }


def twilio_auth():
    return (os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])


def verification(resource, data):
    sid = os.environ["TWILIO_VERIFY_SERVICE_SID"]
    response = httpx.post(
        f"https://verify.twilio.com/v2/Services/{sid}/{resource}",
        data=data,
        auth=twilio_auth(),
        timeout=8,
        follow_redirects=False,
    )
    response.raise_for_status()
    return response.json()


def verified_email(issuer, subject, token):
    response = httpx.get(
        issuer.rstrip("/") + "/userinfo",
        headers={"Authorization": "Bearer " + token},
        timeout=8,
        follow_redirects=False,
    )
    response.raise_for_status()
    data = response.json()
    email = data.get("email", "")
    if (
        data.get("sub") != subject
        or data.get("email_verified") is not True
        or not isinstance(email, str)
        or len(email) > 254
        or not re.fullmatch(r"[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+", email)
    ):
        raise ValueError("A verified sign-in email is required")
    return email


def send(row):
    """Return accepted, retry, failed or unknown; acceptance is NOT proof of delivery."""
    try:
        if row.channel == "email":
            response = httpx.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": "Bearer " + os.environ["RESEND_API_KEY"],
                    "Idempotency-Key": "booking/" + row.id,
                },
                json={
                    "from": row.payload["sender"],
                    "to": [row.recipient],
                    "subject": row.payload["subject"],
                    "text": row.payload["text"],
                },
                timeout=8,
                follow_redirects=False,
            )
        else:
            data = {"To": row.recipient}
            if row.channel == "whatsapp":
                data.update(
                    To="whatsapp:" + row.recipient,
                    From=row.payload["sender"],
                    ContentSid=row.payload["template"],
                    ContentVariables=json.dumps(row.payload["variables"]),
                )
            else:
                data.update(MessagingServiceSid=row.payload["sender"], Body=row.payload["text"])
            response = httpx.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{twilio_auth()[0]}/Messages.json",
                auth=twilio_auth(),
                data=data,
                timeout=8,
                follow_redirects=False,
            )
        if response.is_success:
            identifier = response.json().get("id" if row.channel == "email" else "sid")
            if isinstance(identifier, str) and 0 < len(identifier) <= 100:
                return "accepted", identifier
            return ("retry" if row.channel == "email" else "unknown"), None
        if response.status_code == 429:
            return "retry", None  # An explicit rejection did not accept a message.
        if row.channel == "email" and response.status_code >= 500:
            return "retry", None
        if row.channel == "email" and response.status_code == 409:
            if response.json().get("name") == "concurrent_idempotent_requests":
                return "retry", None
        if response.status_code >= 500:
            return "unknown", None
        return "failed", None
    except (httpx.HTTPError, ValueError):
        # Twilio does not supply a send idempotency contract here: a timeout may
        # already have sent the SMS/WhatsApp. Never blindly send it a second time.
        return ("retry" if row.channel == "email" else "unknown"), None
