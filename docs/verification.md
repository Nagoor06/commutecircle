# Verification — 2026-10-27

Executed in the build workspace:
- Python 3.12 dependency installation and hash-lock generation: passed.
- Ruff checks and formatting: passed.
- Eleven API tests: passed using disposable SQLite databases.
- API source coverage: 100% for the small initial module (118 statements); this is not whole-product coverage.
- Alembic upgrade, model/schema drift check, downgrade and re-upgrade on a disposable SQLite database: passed after correcting a float-column type mismatch.

Not executed: Docker/Compose build, PostgreSQL tests, GitHub Actions, image publication, cloud deployment, device tests or load benchmarks. Docker and a PostgreSQL server are unavailable in this workspace. PostgreSQL integration and Docker build checks are configured in CI and must pass on GitHub before release.

Known dependency warning: Starlette reports that the current HTTPX-based TestClient path is deprecated in favor of httpx2. Tests pass; evaluate that transition with dependency updates rather than suppressing the warning.

This release is an engineering foundation, not a completed carpool application. Authentication and authorization must be implemented before adding user-owned writes or exposing personal ride data.
