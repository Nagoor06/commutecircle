# Ride planner

The public GitHub Pages edition displays real OpenStreetMap streets, GPS or
on-submit place search, a sample car and a browser-only seat simulation.
Selecting a result loads its coordinates in the external map. Search depends
on the public Nominatim service and is intended for light interactive use.
Use a managed geocoder with a shared rate limiter before opening a larger pilot.

The API serves the same files at http://localhost:8000/studio/. Add that URL
(including its final slash) to the application's Auth0 Allowed Callback URLs
and http://localhost:8000 to Allowed Web Origins. Preserve the Swagger callback.
The studio uses PKCE and holds its access token in memory.

After migrating, create a future offer in Swagger as before. Optionally include
this object in the POST /v1/rides body:

    "vehicle": {"make":"Honda","model":"City","color":"Pearl white",
                "purchased_on":"2022-06-12","condition":"good"}

Sign in to the local studio and select the offer under My ride details.
An authenticated reader can also GET /v1/rides/{ride_id}/details.
Old offers have no vehicle snapshot. A rider with an accepted booking may
PUT {"stars": 4} to /v1/bookings/{booking_id}/rating after departure.
Changing their rating updates the original review. The average spans all
rated bookings for that driver. Eligibility establishes booking and departure,
not physical attendance. No phone numbers, registration plates or rider
identities appear in the ride details response.

The location picker explores places independently of the API catalogue.
Booking real rides still uses curated pickup-point IDs. Selecting a private
location on the map does not create a public pickup point.

## Pickup coordination and cancellation

Pickup and drop-off share one map with separate search fields. Drag either pin or use
arrow keys while it has focus. Local matches can appear before a network
response. Unavailable online search falls back to dragging, coordinates and
known Tenali stops. The meetup card copies a selected public landmark and a
pickup link only when requested.

The driver can cancel an entire upcoming ride from the signed-in studio or
POST /v1/rides/{ride_id}/cancel. This locks the same ride row as booking
approval, closes pending and accepted bookings, and excludes the ride from
search in one transaction. A single passenger cancellation affects their own
booking. There is no background notification delivery.

The public ₹20 commitment is a sandbox illustration. Real payments need a
payment provider, verified payment events, and refund reconciliation before
charging users. The optional signed-in meeting-note translator sends only the
entered landmark note to OpenAI. Set OPENAI_API_KEY on the API server. Each
process limits translation calls to ten per minute. The original card remains
available when translation fails. Public GitHub Pages does not call OpenAI.

## Priced shared journeys

In the signed-in studio, list a departure, price per seat for the full journey,
capacity, and ordered public stops with cumulative road kilometres and scheduled
minutes from departure. These are driver-entered distances and times. The
public static edition has a fare preview. The authenticated API stores shared
listings and sandbox payment receipts. Original unpriced, driver-approved
ride offers keep their existing flow.

Inventory is per leg. For A–B–C, A–B and B–C bookings can occupy one seat on
the same trip. A hold lasts up to three minutes, never beyond boarding. A
per-journey PostgreSQL row lock serializes overlapping holds, payment, expiry
checks, early exits and cancellations. Retrying the same checkout ID or pay
request cannot double-charge. Sandbox payment and booking confirmation commit
in the same transaction. No external payment calls are enabled.

Amounts use integer paise. A segment costs the difference between the rounded
cumulative fares at its stops. A driver-confirmed early exit at an intermediate
stop refunds the unused distance and releases onward legs. The pilot passenger
cancellation fee is 0% at least 24 hours before boarding, 10% from 2 to under
24 hours, and 25% in the last 2 hours before boarding. Unpaid holds have zero
fee. Driver cancellation before boarding refunds the full active ticket. A
whole-journey cancellation is available before the journey starts. Receipts
are available in the rider's history. Alternatives and notifications are not
automatically arranged. Real charging needs provider-side idempotency, verified
webhooks and reconciliation of late payments and refunds before launch.
