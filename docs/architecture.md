# Architecture

CommuteCircle is a modular monolith with a separate mobile client. Keep responsibilities separate without adding empty abstraction layers.

| Directory | Responsibility |
|---|---|
| `apps/mobile/` | Future Expo client; currently a planning README |
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
