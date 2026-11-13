# Booking confirmations and updates

The booking transaction writes a durable PostgreSQL outbox event together with the
seat and sandbox ledger change. A unique `(ticket_id, event, channel)` key and the
existing journey lock prevent duplicate events on payment/cancellation retries.
Holds and unsuccessful payments never create confirmation messages. Drivers who opt in also receive new approval-mode seat requests. Opted-in riders receive approval, decline or driver cancellation decisions with a link to their receipt. An approved seat is held until the checkout deadline. Workers skip alerts when consent changes, a decision is superseded or its deadline has passed. Each recipient may enable email and one phone channel (WhatsApp or SMS). A passenger’s receipt shows only that passenger’s alert history.

Profile settings are private. Email comes from the configured Auth0 `/userinfo`
endpoint with matching subject and `email_verified: true`; frontend login now asks
for `openid email`. Existing sessions may need a fresh login. The API never accepts
an arbitrary email destination from the browser. SMS verification binds a Twilio
Verify SID to the signed-in user and pending number, expires after ten minutes and
allows five checks. Sending budgets persist before provider calls: three per account
and number per rolling daily bucket, a 60-second cooldown, and 100 globally per day.
Turn on Verify Fraud Guard and restrict provider destination countries for a pilot.

The API checks pending events every ten seconds while running. `FOR UPDATE SKIP
LOCKED` supports concurrent workers. It rechecks current consent and ticket state,
suppresses superseded confirmations, stops after five attempts or one hour and
preserves the frozen payload across retries. Backoff begins at 60 seconds. Resend
uses a stable idempotency key; the one-hour send window is within its 24-hour key
retention. An uncertain SMS/WhatsApp send or crashed phone dispatch becomes
`unknown`, requiring operator investigation rather than a potentially duplicate send.
Explicit provider rejection with HTTP 429 can retry. Provider failure cannot undo
the booking. `accepted` means accepted by the provider, **not delivered**. No delivery
webhook/receipt ingestion is implemented yet. The private receipt shows that limit.

Notifications include the public booked stops, pickup time in IST, reference,
sandbox totals/refunds and a sign-in-required receipt link. They exclude precise
GPS, saved office labels, contact lists and driver/passenger phone numbers. Sandbox
messages explicitly say no real money was taken. Payloads and destination copies
are cleared after 30 days while the service is running; expired verification data
and old rate buckets are also cleared. Current opted-in profile details remain until
replaced. Turning a channel off suppresses queued work, but cannot recall a message
already submitted to a provider.

## Provider activation

No sending account, domain purchase, template approval or paid worker is created by
this change. Configure these **server-side secrets/settings** in the existing
Render service's Environment page, or a local ignored `.env` for Compose. Never put
keys in Pages, app-settings.json, GitHub commits or chat.

| Channel | Required settings |
| --- | --- |
| Email | `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL` on a verified sending domain |
| SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_SERVICE_SID` |
| WhatsApp | Twilio credentials, `TWILIO_WHATSAPP_FROM` (`whatsapp:+…`), approved `TWILIO_WHATSAPP_CONTENT_SID` |
| Phone verification | Twilio credentials, `TWILIO_VERIFY_SERVICE_SID` |

Create an approved WhatsApp utility template for all booking event types. Variables
are `1` reference, `2` event title, `3` public origin, `4` public destination,
`5` pickup time, `6` sandbox net fare, `7` sandbox refund, `8` receipt URL. Its fixed
text must say **sandbox; no real money was taken** and identify CommuteCircle.
Use the provider's required sender registration and destination-country setup for
SMS. WhatsApp opt-in is separate from accepting the SMS verification code. If a
provider is unconfigured at booking time, that event is `unavailable`, not sent
later unexpectedly when credentials are added. Future bookings use the new setup.

Validate activation with a consenting test recipient on the configured provider
and check the private receipt and provider console. Automated CI uses mocked HTTP
transports; it never sends real messages. A free Render web service can sleep, so
this is not an always-on delivery SLA. Production operation needs an always-on
process (or a separately approved worker), delivery receipts, bounce/opt-out webhook
handling and operational monitoring before promising time-critical alerts.

Official references checked 2026-11-07:

- https://auth0.com/docs/api/authentication/user-profile/get-user-info
- https://resend.com/changelog/idempotency-keys
- https://www.twilio.com/docs/messaging/api/message-resource
- https://www.twilio.com/docs/verify/api/verification
- https://www.twilio.com/docs/verify/api/verification-check
