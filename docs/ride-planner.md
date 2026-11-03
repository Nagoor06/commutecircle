# CommuteCircle web app

Open `/studio/` on the API or deploy its static client at `/commutecircle/` on Pages.
Hash routes support direct links and browser Back on both hosts. Each navigation
mounts one screen and cancels work belonging to the previous screen.

- **Book a ride** has one pannable, pinch-zoomable map. Either pin can be dragged
  or moved with the keyboard. The two fields independently debounce suggestions
  by 360 ms. On-device matching uses public station areas and station codes.
  A configurable Photon endpoint adds place and street matches. A failed lookup
  preserves local results. Device location is displayed after the user selects it.
- **Matching rides** update after 420 ms of inactivity for a signed-in rider.
  Search checks ordered stops, boarding time and all legs in the requested
  segment *before* pagination. Coordinates use a 2 km radius. A stop without
  coordinates uses its normalized name. Offers can be browsed without a route.
- **Ride details** show itinerary, vehicle, passenger reviews, booked distance
  and segment price. **Checkout** shows the server's ticket, the live hold
  countdown and a sandbox receipt. Pickup instructions belong to a booked ticket.
- **Offer a ride** uses one row per stop. Distances and minutes are cumulative
  from the start. Drivers set seats, full-route fare and optional vehicle.
  A review step precedes publication. Replaying the same offer ID cannot create
  a second listing. The backend keeps older offers without coordinates or car details readable.
- **My trips** separates riding and driving, current reservations and history.
  Drivers can manage passengers and confirm early exits. Passengers can cancel
  or rate a completed paid segment. Cancellation includes a fee ceiling so the
  server asks for a new quote when the fee increases during confirmation.
- **Help** contains booking policies and the authenticated local RAG assistant
  when its optional service is enabled.

The browser stores no access tokens in local or session storage. PKCE verifier
and return route are temporary; an offer awaiting sign-in can be resumed in the
same tab. Search coordinates stay out of document URLs. Tile services receive
the map area; selecting road preview sends endpoints to OSRM. Known public
corridors can request a road preview automatically. Straight-line distance is
labelled explicitly when road routing is unavailable. Driving estimates do not
determine passenger charges; the confirmed offer's leg distances do.

## Shared booking backend

Configure OIDC as in [local login](local-login.md). Preserve the Swagger callback
and add the studio's exact callback, including its trailing slash, to Allowed
Callback URLs. Add the frontend's origin to Allowed Web Origins. Run
`docker compose up --build -d` to apply migration 0007 and start the same-origin
app at http://localhost:8000/studio/. A physical device requires a reachable
HTTPS deployment and a registered callback.

A separately hosted client reads its operator-managed `app-settings.json`.
Set `apiOrigin` to the actual HTTPS origin of the deployed FastAPI service.
Set `WEB_ORIGINS` on the API to the exact frontend origin, and register
`https://nagoor06.github.io/commutecircle/` as an Auth0 callback and
`https://nagoor06.github.io` as an Allowed Web Origin for Pages. Do not use a
URL query parameter for the API origin. Only public configuration belongs in
this file. Place search can point to a self-hosted Photon-compatible endpoint;
set it to null to use only the bundled station index.

The optional [Render staging blueprint](../render.yaml) defines an API container
and private PostgreSQL connection. Applying it requires a Render account and
a review of the offered database plan. Set the four OIDC values from the existing
configuration. The container serializes migrations across starting instances
and checks `/health/ready` before traffic. Confirm the real service URL and
two-user sign-in on the deployed instance before enabling it in Pages settings.

## Release and testing

`python scripts/package_web.py --out /path/to/new-output --api-origin https://YOUR-ACTUAL-API-ORIGIN`
generates an index and immutable asset directory. Omit the origin for a planning-only
deployment. The same buildless modules ship in the API image. CI packages the
Pages artifact and runs two isolated Chromium sessions against PostgreSQL and
the real API. Only the identity provider's transport is local to the test;
signature, scope, ownership, inventory and receipt logic still execute.

The public client has no generated inventory. Disconnected deployments allow
route planning and offer preparation, and explain why booking/publishing is
unavailable. All payment endpoints in this release use sandbox accounting.
There is no live payment provider or automatic passenger notification.
