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
