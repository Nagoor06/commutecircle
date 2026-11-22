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
