# CommuteCircle

A carpool app for planning a route, publishing offers, reserving a ride segment and managing a trip. The responsive web app has separate booking, driver, checkout, trips and help screens.

[Web app guide and staging setup](docs/ride-planner.md) · [Architecture](docs/architecture.md) · [Authentication](docs/authentication.md)

Shared rides and reservations use FastAPI, PostgreSQL and Auth0. Payment accounting remains in sandbox mode. A static deployment without a configured API still provides location planning and explicitly disables shared bookings.

## V2 local setup (Windows PowerShell)

With Docker Desktop running, check out `main` and run the public Auth0
configuration helper from the project root:

```powershell
.\scripts\configure-local-auth.ps1
docker compose up -d --build
docker compose ps
```

Open http://localhost:8000/studio/ and http://localhost:8000/docs.
The helper creates `.env` when missing and fills only blank *public*
Auth0 settings; it never overwrites passwords or existing provider settings.
**You must still register the local callbacks and grant API permissions in Auth0.**
See [Local Auth0 login](docs/local-login.md).

V2 pilot features: driver/vehicle approval, consented seat requests, boarding PIN,
private safety reports, repeating templates and invite-only commute circles.
The hidden `#/staff` console requires an independently authorized staff token.
No real payments, automatic KYC, emergency dispatch or 24/7 staffing are provided.
See the [V2 release notes](docs/commutecircle-v2.md).

## Run locally

Requires Docker Engine with Compose:

```sh
cp .env.example .env
docker compose up --build
```

API documentation: http://localhost:8000/docs
Readiness: http://localhost:8000/health/ready
Pickup-point lookup: http://localhost:8000/v1/pickup-points?city=Hyderabad

The database starts empty. An explicit local-only demo command can add clearly labelled synthetic test points. Ride writes require a configured provider-issued token; there is no development authentication bypass. Curated public pickup points will be added after choosing the pilot area.

For Python development (Python 3.12):

```sh
cd services/api
python -m venv .venv
# Linux/macOS: source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
pip install --require-hashes -r requirements-dev.txt
pytest --cov=app --cov-report=term-missing --cov-fail-under=85
```

Local tests default to disposable SQLite databases; CI additionally runs against PostgreSQL. To run the server directly, export DATABASE_URL from your environment, run `alembic upgrade head`, then `uvicorn app.main:create_app --factory --reload`. Never run destructive migration tests against shared or production databases.

## Working agreement

Use short-lived `feat/`, `fix/`, or `chore/` branches and pull requests into `main`. Keep commits reviewable. Require `API checks` to pass. Squash merge and delete merged branches. Do not require another person's approval when working alone; enable independent review when a collaborator joins. Do not commit `.env`, tokens, database dumps, or personal location data.

See [engineering plan](docs/engineering-plan.md), [release process](docs/releases.md), and [verification record](docs/verification.md).

## Repository and architecture

Source: https://github.com/Nagoor06/commutecircle

Read [architecture](docs/architecture.md) for the module boundaries and [Windows setup](docs/windows-setup.md) for GitHub Desktop instructions.

## Test real sign-in locally

Follow [local Auth0 login](docs/local-login.md) to enable PKCE sign-in in Swagger and test `/v1/rides/mine`. This does not implement the mobile UI.

## First local ride

After sign-in works, follow [first demo ride](docs/first-ride.md) to seed two synthetic pickup points and exercise create, list and search.

Next, follow [bookings and location selection](docs/bookings-and-locations.md) for the database
upgrade, driver approval flow, concurrent seat protection, and nearby pickup-point API.

### Ask the rider guide

With the existing local Auth0 and database setup, run this in the repo root:

```powershell
docker compose -f compose.yaml -f compose.ride-help.yaml up --build -d
```

On first start, Docker downloads two Ollama models. Check progress with
`docker compose -f compose.yaml -f compose.ride-help.yaml logs prepare-help-models`.
Sign in at http://localhost:8000/studio/ and ask “Is the ₹20 commitment real money?”
under **Help → Ask the guide**. Swagger also exposes `POST /v1/help/ask`.
This runs locally with Docker. Inference requires the API and optional ride-help services.

The worker embeds the sections of the [rider guide](services/ride-help/guide.md)
with all-MiniLM, stores them in a SQLite vec0 table, and retrieves up to three
passages by cosine distance. LangGraph routes low-similarity queries to an
abstention. Otherwise a local Qwen model selects supporting evidence, with the
option to abstain. The API displays the selected passage verbatim with its
section link. This extractive RAG design limits invented policy text. It can
still select an irrelevant passage, so the source is always available.
The small index rebuilds on worker restart. Restart the worker after guide
changes. Neither GPS, tokens nor user booking records are indexed. Only the
question text is sent to the internal worker. This first version is English.
