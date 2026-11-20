# Message notifications — 0.3.0

Signed-in users have an Inbox unread badge throughout the app and a clickable
alert when a new incoming message arrives outside the active chat. Polling runs
every eight seconds while visible and refreshes on focus and read acknowledgements.
Opening the app does not replay old unread messages as toasts. The badge counts
all unread incoming messages, not just the first Inbox page. Blocked conversations
do not contribute to alerts. Sending shows “Message sent”.

## Phone notifications

Inbox has an explicit Enable notifications control. Browser permission is requested
only after a click. Encrypted Web Push opens the booking chat on tap. Notification
text is generic: message bodies, names, phone numbers and locations never enter the
push payload. The worker has no bearer token and caches no API responses.

Device subscriptions are bound to the account and a random browser binding.
Sign-out clears the binding, closes alerts, unsubscribes the browser and revokes
the server endpoint. Account changes suppress old queued deliveries; the worker
rejects old bindings and duplicate messages. Web Locks serialize subscription
changes across tabs. The worker serializes pushes and binding changes. A queued
push is suppressed if already read, the chat is blocked/cancelled, or the device
no longer belongs to the recipient. Sender and delivery retries are deduplicated.

Migration 0021 adds subscriptions and a transactional message outbox. PostgreSQL
claims use `FOR UPDATE SKIP LOCKED`; crashed deliveries are reclaimed. Temporary
failures have bounded backoff; 404/410 removes invalid subscription credentials.
Provider acceptance is not proof of display. Endpoints are restricted to supported
browser providers and redirects are disabled, preventing arbitrary callback URLs.

## Configuration and operation

Generate credentials once with the API Python environment:

```bash
python scripts/generate_vapid.py --out /secure/path/commutecircle-vapid.json
```

Set `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, and `VAPID_SUBJECT` in the API service
environment. Never put the private key in Pages, Android, source control or logs.
Authenticated `GET /v1/me/push` returns only the public key and availability.
Preserve keys across deploys; replacing the pair requires devices to re-enable.
Render service environment variables own these settings. The Blueprint omits their
values, so future syncs preserve the configured credentials.

`NOTIFICATION_WORKER_ENABLED=false` disables both outbox workers for tests. Message
push runs separately from email/SMS, checking every two seconds. Delivery records
are purged after 30 days and unused subscriptions after 90 days. Provider TTL and
retry lifetime are one hour.

Free Render instances can sleep. Requests wake the service, but delivery has no
guaranteed latency and notifications are not an emergency channel. A production
availability commitment needs always-on hosting and delivery monitoring. Permission,
battery restrictions, connectivity and browser support also affect display. CI
sends no messages to real people or devices.

## Verification

API tests cover isolation, total unread counts, invalid endpoints/keys, account
switching, revocation, duplicate sends, read/block/cancel races, expiry, provider
failures and retry scheduling. Worker tests check privacy, deduplication, old-account
suppression, safe links and active chats. Browser checks cover mobile overflow,
badges, toast actions, refresh, sign-out, manifest scope, icons and offline navigation.
A real phone permission/background-delivery test remains necessary before Play
production rollout. Android setup and remaining store gates: `apps/mobile/README.md`.
