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

Pickup and drop-off each have their own searchable map. Drag the pin or use
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
