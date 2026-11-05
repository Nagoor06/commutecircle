# Trusted trip sharing

Riders with a paid priced ticket and drivers of a listed journey can opt in from
My trips. Favourite contacts live in Profile: five private slots, a name and an
optional international SMS number or email. The default device share menu needs
no stored address. Opening a composer does not send a message automatically.
CommuteCircle cannot ensure that a device share sheet selects the saved person;
the traveller selects the recipient before sending.

The dedicated sharing screen asks for consent before requesting precise device
location. A persistent app-wide status and Stop sharing control remain visible
while navigating between screens. The recipient opens a separate guest tracking
screen with a live GPS map, update age, device-reported accuracy and an optional
OpenStreetMap link. The recipient explicitly opens the in-app map before tiles
load from OpenFreeMap; its requests disclose the area viewed, never the capability
token. The external OpenStreetMap link discloses the selected coordinates only
when opened. The driver consent explains map-provider access. No contacts, employer, login identifier or
phone number appears in the tracking response.

## Access and lifecycle

- An authenticated owner starts and updates sharing. A driver cannot publish
  the passenger's device position, and a passenger cannot update another ticket.
- Start is allowed from one hour before the booked pickup until one hour after
  the booked drop-off. A link expires at the earlier of four hours after start
  or one hour after drop-off. The latest fix is considered stale after one minute
  and the link expires after five minutes without a successful fresh update.
- The 256-bit random bearer token travels in a URL fragment and in the view
  request body, never in a request path/query. The database stores only its
  SHA-256 digest. Anyone receiving or forwarding the full link has access: this
  is a capability link, not recipient identity verification.
- The frontend holds the token in memory, not local/session storage. The shared
  URL can remain in messaging apps and browser history after expiry. API
  responses use `Cache-Control: no-store` and the page sets no-referrer.
- Owner updates reject old or out-of-order observations, invalid coordinates
  and non-finite values. A new link revokes earlier links for that owner/trip.
- Location writes, stop, cancellation and early exit all lock the journey row.
  Revocation therefore wins a race with an in-flight update. Cancelling a ride
  ends all its links; cancelling a ticket or confirming early exit ends that
  passenger's links. Stop and cancellation clear the last fix in the same
  transaction. There is no trail of past fixes in the application database.
- Expired links stop working even if cleanup has not run. A background task
  clears expired coordinates on API startup and every minute while running.
  Free hosting can sleep; cleanup resumes when it wakes. Infrastructure backups
  follow the provider's retention policy and are not instantly erased by this
  application task. Minimal revoked-link metadata remains for access checks.

## Failure behaviour

GPS requires HTTPS and browser permission. A denied permission stops sharing.
The app requests a fresh fix every 10 seconds while visible, in addition to a
location watch, and throttles uploads to at most one per five seconds. It never
re-sends a cached fix as a new update. Screen locking, background tabs, battery
saving, poor GPS or network loss can pause updates. The receiver sees update age
and stale status, not an invented live marker. These browser constraints mean
this is **not guaranteed background tracking or emergency response**.

Stop clears the device watch immediately and revokes the server link. When the
network fails, the UI explains that server revocation is unconfirmed and the
five-minute no-update expiry still applies. Closing/reloading the page makes a
best-effort keepalive revocation; recipients should check the last update time.
Deleting a saved contact does not revoke a previously sent link.

Location and contacts never enter booking chat, route matching, model prompts,
RAG embeddings or MCP outputs. The AI guide contains only the sharing policy.

## Validation

API tests cover account isolation, five-slot limits, contact validation, paid
trip ownership, hash-only token storage, stale/expired/replaced links, delayed
fixes, cancellation and exit cleanup. A real PostgreSQL test races Stop with a
location update. Browser CI covers consent, a saved favourite, a mocked device
GPS fix through the real API, guest tracking, stop/restart and driver cancellation.
No messages are sent to real contacts in tests.

References: [W3C Geolocation](https://www.w3.org/TR/geolocation/) and
[MDN watchPosition](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition).

## Live vehicle tracking

Drivers have a separate, initially unchecked consent to share with confirmed
passengers. Existing links and new contact-only links remain private to their
recipients. Passengers open **Track vehicle** from My trips or their receipt.
`GET /v1/journeys/{jid}/tickets/{tid}/driver-location` checks the signed-in
passenger, paid ticket, journey, travel window and active driver consent each
time. Cancelling or exiting a ticket removes that passenger's access; it does
not stop sharing for other passengers. No tracking token is exposed to riders.

The viewer polls every five seconds while visible and refreshes on reconnection.
The driver GPS watch uploads at most every five seconds (plus a fresh fix request
every ten seconds when stationary). This is periodic live tracking, not an SLA
for five-second delivery. A car marker means the **driver's device position**,
not independently verified vehicle telemetry. Passenger links use a person
marker instead. Movement interpolates briefly between received GPS fixes and
never extrapolates a route or invents movement. Approximate fixes show accuracy;
large jumps and reduced-motion preferences skip animation. Manual map panning
pauses following until the viewer chooses Follow location.

Freshness ages locally using server time even if subsequent requests fail. A
paused, disconnected or stale feed shows a last-known position, and expired or
revoked access removes the map and position link. No route matching, geocoding,
ETA estimate or location history is computed from private live coordinates.

Migration 0011 defaults passenger access to false for every existing link.
API tests cover consent, strangers, unpaid/wrong/cancelled tickets, early exit,
travel windows and expiry. Browser CI verifies real API GPS uploads, moving car
markers, rider/person markers, mobile layout and removing a marker on stop.
