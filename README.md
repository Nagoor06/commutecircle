# CommuteCircle

Privacy-aware carpooling built in small, tested increments. Start with public meeting points; add ride offers, seat requests, and driver approval next.

## Actual status

Milestone 0: repository and API foundation. Implemented: health/readiness endpoints, a public pickup-point read API, SQLAlchemy model, Alembic migration, tests, Docker Compose, and GitHub Actions CI/image publication configuration. No user authentication, booking, matching engine, mobile app, or cloud deployment is implemented yet. GitHub workflow results must be checked on the foundation pull request; cloud deployment is not configured.

## Run locally

Requires Docker Engine with Compose:

```sh
cp .env.example .env
docker compose up --build
```

API documentation: http://localhost:8000/docs
Readiness: http://localhost:8000/health/ready
Pickup-point lookup: http://localhost:8000/v1/pickup-points?city=Hyderabad

The database starts empty; no invented map locations are shipped. The API currently exposes only reads. Curated public pickup points will be added after choosing the pilot area.

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
