# Bookings and location selection

## Upgrade locally

Pull main in GitHub Desktop, then run from the project folder:

```powershell
docker compose build
docker compose stop api
docker compose run --rm migrate
docker compose up -d
docker compose ps -a
```

Confirm `/health/ready` returns `{"status":"ready"}`. Keep the database volume;
do not use `down -v`. Migration 0003 preserves existing rides and sets their
capacity from their existing available seats. This is a coordinated upgrade:
the old application cannot create rides against the new required capacity column.
Do not roll back to the old application against this schema. Schema downgrade
deletes booking history and refuses sold-out rides; it is only exercised on
disposable databases in CI. For real data, back up first and use a forward fix.

## Try a booking in Swagger

1. As the driver, create a fresh future ride with one seat. Save its ride ID.
2. In a separate browser profile, sign in as a different Auth0 user. Authorize
   with `rides:read` and `rides:write`, then call
   `POST /v1/rides/{ride_id}/requests`. No request body is needed. Save the returned
   booking ID; its status should be `pending`.
3. As the driver, call `GET /v1/rides/{ride_id}/requests`, then
   `POST /v1/bookings/{booking_id}/accept`. Status becomes `accepted`; the ride
   has zero available seats and is excluded from searches requiring a seat.
4. As the rider, call `GET /v1/bookings/mine`. Call
   `POST /v1/bookings/{booking_id}/cancel` to restore the seat. Repeating cancel
   returns the same state without restoring a second seat.

The driver can reject a pending request with `/reject`, or cancel a pending or
accepted booking with `/cancel`. Riders cannot accept or reject requests.
Unrelated users cannot list or modify another user's bookings. Drivers cannot
request their own ride. Existing Auth0 scopes suffice; no new scopes are needed.

## Two people requesting the last seat

Each request is for one seat. Pending requests do not reserve seats: two riders
can both receive `pending`. Only driver acceptance consumes a seat. Every booking
mutation locks the ride row first, then reads/locks its booking, in one database
transaction. A conditional update decrements only when a seat remains. Booking
status and seat count commit together, or both roll back.

If two approvals compete for one seat, one succeeds and the other gets HTTP 409.
The unsuccessful booking stays pending. An accepted cancellation restores exactly
one seat, including concurrent retries. Capacity and nonnegative-seat checks add
database safeguards. A unique ride/rider identity constraint prevents duplicate
requests. Repeating a request returns the same booking, even if cancelled or
rejected; terminal requests cannot currently be reopened. New transitions require
a future departure; retries of an already achieved state remain safe.

CI tests real PostgreSQL connections racing last-seat approvals, duplicate
requests/approvals, duplicate cancellations, and acceptance versus cancellation.
SQLite skips these four tests because it cannot validate PostgreSQL row locks.

## Location API and remaining client work

Manual search of configured pickup-point names:

```text
GET /v1/pickup-points?city=DemoCity&q=Pickup
```

Find nearby configured public pickup points:

```text
POST /v1/pickup-points/nearby
```

```json
{"latitude":0,"longitude":0,"radius_m":2000,"limit":10}
```

The response includes `distance_m`, ordered nearest first. Radius is limited to
50–5000 metres; results to 20. Coordinates are supplied in the body rather than
the URL and this service neither persists them nor logs request bodies. Ensure
future proxies/APM tooling also avoids recording precise coordinates.

DemoCity points are fictional. This is not a general address geocoder or a map
screen. The client still needs a map provider, address autocomplete, an explicit
“Use my location” action with device permission, manual fallback, and confirmation
of the public pickup point before sending its ID. GPS should suggest nearby points,
not silently publish a person's home or live location. A dropped pin should suggest
configured public pickup points until arbitrary pickup locations are supported.
For a large point catalogue, replace the current bounding-box/distance calculation
with indexed geospatial queries and introduce request rate limits.
