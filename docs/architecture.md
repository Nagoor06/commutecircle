# Architecture

CommuteCircle is a modular monolith with a separate mobile client. Keep responsibilities separate without adding empty abstraction layers.

| Directory | Responsibility |
|---|---|
| `apps/mobile/` | React Native Android client with Expo, TypeScript, secure sessions and bundled Hermes UI |
| `services/api/app/main.py` | Application factory and lifecycle wiring only |
| `services/api/app/api/routes/` | HTTP endpoints, validation and response mapping |
| `services/api/app/auth/` | Token validation, principals and scope checks |
| `services/api/app/services/` | Ride, booking and location rules; transaction ownership |
| `services/api/app/core/` | Environment configuration |
| `services/api/app/db/` | SQLAlchemy base, engine and request-scoped sessions |
| `services/api/app/models/` | Database entities and constraints |
| `services/api/app/schemas/` | Public request/response contracts |
| `services/api/app/repositories/` | Database queries; no HTTP handling |
| `services/api/app/middleware/` | Cross-cutting request logging and correlation |
| `services/api/migrations/` | Versioned schema changes |
| `services/api/tests/` | Shared fixtures plus tests grouped by responsibility |
| `.github/workflows/` | CI and image publication |
| `docs/` | Decisions, verification and operations guides |

Pickup listing uses route → repository → database; response schemas control exposed fields. Ride creation calls `app/services/rides.py`, which owns point/departure rules. Booking mutations call `app/services/bookings.py`, which owns transactions, ownership checks, retry behavior and state transitions. The repository locks the ride before the booking and performs conditional seat updates; it never independently commits a multi-step transaction. Nearby pickup suggestions use `app/services/locations.py` for bounding-box filtering and spherical distance calculations. See [booking and location behavior](bookings-and-locations.md).

Request-scoped sessions are injected with FastAPI dependencies. Migrations import model metadata but never import the running application. Configuration loading does not log database credentials. Tests use the app factory so each test can select an isolated database.

No business logic belongs in `main.py`. Avoid generic base repositories, single-file route collections, and dummy services that only forward calls. Introduce queues, Redis, PostGIS and service extraction when their requirements exist and can be tested.

The browser entry point mounts one feature at a time. In
`services/api/app/studio/app`, `screens/` owns routes and their lifecycle,
`components/` owns shared map, autocomplete and ticket interactions, and
`data/` owns transport and domain formatting. The server owns transactions and
search eligibility. `journey_catalog.py` builds read models for discovery and
detail, batching ticket reads per candidate page. Hash routing works on static
hosting without a rewrite rule; an AbortSignal scopes each screen's requests,
event listeners, timers and map resources.


## Client and deployment stack

| Layer | Implementation |
|---|---|
| Android | React Native with Expo, TypeScript and Hermes. Native screens call the versioned HTTP API. Expo SecureStore holds the session and in-progress PKCE verifier. |
| Website | Static HTML, CSS and JavaScript ES modules. A service worker handles offline shell assets and Web Push. Pages hosts the client, and FastAPI also serves it under /studio. |
| API and identity | Python 3.12, FastAPI, Uvicorn, Pydantic and Auth0. Both clients use the same OAuth audience and ride permissions. |
| Database | PostgreSQL, SQLAlchemy 2, psycopg and Alembic. Seat decisions, payments, chat and notification outbox records are stored on the server. |
| Places and maps | Photon supplies world place suggestions. The website also has an offline Indian station catalogue, Leaflet and OpenFreeMap tiles. OSRM provides optional road estimates. |
| Delivery | GitHub Actions builds Docker images, checks PostgreSQL migrations, runs API, browser and Android tests, and packages the APK and AAB. Render serves the API. |

### Why these choices matter

The Android app bundles its React Native UI and runs JavaScript with Hermes. It can open its booking screen offline. A browser wrapper would reuse the existing website more directly, but tying startup to the browser was a failure point in the earlier Android app. Kotlin is also a good Android choice for deep platform integration. It would require a second implementation of screens and client-side rules to serve the web.

The current site uses the browser DOM. This lets HTML forms, links, Leaflet maps and the service worker run on static hosting. Its cost is that a booking UI change needs separate web and Android work. The server already supplies both clients with the same fares, seat counts, booking permissions and receipts.

Expo with React Native Web can share TypeScript screens and components across Android and the browser. On Android a component renders native controls. On the web it renders accessible DOM elements. A gradual migration can start with ride details and checkout. Browser URLs and Back navigation, keyboard focus, browser push, map controls and the OAuth return path need web implementations and acceptance tests. Android keeps secure token storage and runtime location permissions. Existing browser-only flows include staff review, recurring rides and trip tracking. [Expo web support](https://docs.expo.dev/workflow/web/) · [Platform-specific implementations](https://reactnative.dev/docs/platform-specific-code)

FastAPI and Pydantic validate the same HTTP contract for both clients. A Node API could share TypeScript types with a client, but it would also require porting the tested booking state transitions and migrations. PostgreSQL transactions update seat inventory, charges and refunds together. Document storage could support transactions too, at the cost of redesigning the existing joins and constraints.

### Booking on behalf of a traveller

On public journeys, a hold or approval request can include a guest’s display name and the booker’s confirmation of permission. A ticket without a guest belongs to the person travelling. In both cases the authenticated booking account owns checkout, cancellation, chat and any refund. The guest label appears on receipts, driver manifests and the private booking conversation. The API sends no message directly to a guest.

An account can reserve for itself and separately for named guests, subject to segment capacity. The same account, guest name and segment recover the same active reservation after a lost response. Different guests with the same first name can use distinguishable display names. Private circle rides retain member-account booking, and live GPS and firsthand ratings require a traveller booking from their own account. Earlier tickets carry a null guest label after migration `0022`.
