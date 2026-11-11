# CommuteCircle V2 pilot

The web app and API on `main` implement the pilot workflow below.

## Technical shape

- Existing FastAPI, SQLAlchemy, Alembic and PostgreSQL modular monolith remains the application.
- `Journey` + `Ticket` is the inventory, segment reservation and sandbox accounting authority for new V2 features.
- Existing `Ride` + `Booking` history remains readable; the older workflow has not been deleted or automatically migrated.
- New tables are created additively in Alembic revisions `0013` to `0018`. Revision `0019` backfills checkout confirmation from the payment ledger and closes pending requests on already-cancelled journeys.
- Scoped Auth0 principal (issuer + subject) is used in every V2 authorization check.

## How V2 works

1. Rider/driver enters a display name. A driver submits a verification case reference and vehicle details.
2. An independently authorized reviewer checks the actual evidence **outside this app** and marks the application and vehicle approved. A user-submitted reference alone **must never** count as verified.
3. An approved driver publishes an approval-mode `Journey` linked to their approved, passenger-seat-limited vehicle.
4. A rider explicitly consents to fare, pickup time and policy `cc-v2-1`, then requests a seat. Pending requests **do not** reserve inventory or charge money.
5. A verified driver approves under the journey row lock; approved requests become temporary `held` tickets. Adjacent nonoverlapping segments may reuse seats. The rider then pays in the **sandbox**; approval and payment are not the same event.
6. Near pickup, a paid rider creates a short-lived six-digit boarding PIN, shown only in their authenticated checkout. The driver validates it; the server keeps a salted, iterated hash, enforces attempt limits and records a boarding event.
7. After scheduled drop-off, the rider confirms completion; the completed ticket's private GPS sharing is revoked. Reports are visible only to authors and staff reviewers.
8. Drivers create a timezone-bound recurring template. The web UI materializes the next 14 days. The driver may skip an individual date before bookings exist.
9. Invitation-only circles control private journey discovery. One-time invite tokens are hashed in the database. A circle membership is **never** permission to view a member's location, contacts or private booking messages.

## Manual operation and limitations (must be fixed before a public launch)

- Driver/vehicle reviews are **manual**. `v2:staff` is a privileged identity-provider scope and must never be assigned to ordinary users. Integrate an actual evidence review process, secure document retention, reviewer audit and anti-fraud controls before enabling real verification badges at scale.
- `V2_REQUIRE_DRIVER_VERIFICATION=true` can require verification for new instant-mode public offers as well. Default is false to preserve legacy development behavior. Do not turn on the flag before staff onboarding is ready.
- Legacy instant booking remains on existing journeys and does not retroactively receive consent/boarding fields. Old trip history is preserved.
- Request/approval inboxes are in the web app, but a dedicated outbox event for new V2 pending requests is still needed. The API already runs the outbox worker for opted-in booking confirmations and refunds.
- Automatic recurring expansion **beyond the first 14 days** requires a reliable scheduled worker. The initial V2 endpoint materializes at most 14 days per call; it is idempotent and serialized per template. Do not advertise unlimited unattended recurrence yet.
- No native background-location tracking guarantee. Browser location remains foreground-sensitive, and this app is not an emergency dispatch service.
- There is no staffed 24/7 emergency hotline, external identity-verification provider, real payment processor, transport insurance or signed payout reconciliation.
- A pilot must have a named trust-and-safety reviewer, incident response procedures, and legal/insurance/compliance review for the jurisdiction.
- Booking disputes, no-shows, driver interruption after departure, seat reassignment, member removal and circle role transfer remain further V2 work.
- Browsers display user-provided names and vehicle information carefully; never expose registration numbers, private ID references, issuer/subject, notification contacts or precise device coordinates through public journey and circle responses.

## Rollout requirements

- Do not merge while CI is red. Validate Alembic upgrade/downgrade/check on PostgreSQL and SQLite migration history, API tests with minimum 85% coverage, seat-concurrency races and browser tests.
- Keep schema changes additive. Rolling back the application should not destructively roll back production tables; preserve booking/payment and verification evidence.
- Launch only on a narrow invitation-controlled corridor; manually test real devices, booking consent, vehicle mismatches, missed pickups and reporting.
- Do not enable real payments until signed gateway webhooks, reconciliation, refunds, commercial compliance and dispute handling are implemented.

## Staff review screen

Open `#/staff` before signing in to request the reviewer scope. Only accounts independently granted `v2:staff` by the provider can review cases. It lists pending driver and vehicle applications and open safety cases, with explicit reviewer decisions and case notes. The server independently enforces staff authorization on every API request. The route does not imply emergency dispatch or independent proof verification.

## Local setup, version and compatibility

The API metadata version is `0.2.2`; URL paths remain `/v1` for backward
compatibility. Old Ride/Booking endpoints are marked deprecated in Swagger
only, not removed. Run `./scripts/configure-local-auth.ps1` (PowerShell) to
fill missing **public** Auth0 settings in a local `.env`, then
`docker compose up -d --build`. Register the Auth0 allowed callbacks and
user-delegated API grants manually in the Auth0 Dashboard; this repository
cannot configure an external tenant or secret store. `V2_REQUIRE_DRIVER_VERIFICATION`
defaults to `false` while legacy instant journeys remain compatible.

Manual approval now prevents a staff identity from approving its own driver
or vehicle application. Staff scopes, access to evidence and real-world
verification still require operational controls before a public pilot.
