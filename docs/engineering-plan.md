# Engineering plan and evidence ledger

## Architecture decision 001

Use a modular FastAPI monolith, PostgreSQL, and a React Native/Expo TypeScript client. Keep identity, rides, booking, and matching as separate modules inside one API. This keeps transactions and deployment understandable while preserving module boundaries. Add PostGIS when route queries require it, Redis when measured contention or rate limiting justifies it, and background workers for retryable notifications. Kubernetes and microservices are not requirements for the MVP.

## Delivery milestones

1. Foundation (this increment): explicit configuration, migrations, health probes, privacy-conscious logging, reproducible dependencies, tests, container build, CI, image publication.
2. Identity and rides: managed OIDC sign-in, verified token validation, ownership checks, curated pickup IDs, timezone-aware departures, ride creation/search, API contract tests. Never trust a caller-supplied user ID.
3. Booking: driver approval, atomic seat allocation, duplicate-request prevention, idempotent retry behavior, cancellation state transitions, and PostgreSQL concurrency tests. Acceptance must not oversell the last seat.
4. Mobile: Expo screens, secure token storage, API integration, loading/empty/error states, accessibility checks, component tests and device smoke tests.
5. Staging and operations: provider-specific infrastructure as code, OIDC deployments, database backups/restore drill, OpenTelemetry tracing, metrics dashboard, alert and rollback exercise.
6. Route matching: PostGIS, public pickup walking limits, driver detour constraints, ranking evaluation and realistic seeded load tests.
7. Optional AI: natural-language discovery only after deterministic filters work; evaluate accuracy, latency, cost, and privacy against a non-AI baseline. Do not add LangGraph or RAG without a concrete need.

## Skills to demonstrate beyond resume keywords

Existing experience already includes Python, FastAPI, Docker, CI/CD tools and AI APIs. The goal is deeper, inspectable evidence, not more tool names.

| Practice | Evidence we will produce | Status |
|---|---|---|
| Reproducible builds | Hash-locked Python dependencies, non-root container | Source prepared; Docker execution pending |
| Database evolution | Reviewed Alembic migrations, migration checks | Initial migration; local SQLite validation |
| Integration testing | PostgreSQL tests and CI artifacts | Workflow configured; remote run pending |
| Transaction correctness | Last-seat race test, idempotent request tests | Implemented; PostgreSQL race tests in CI |
| Secure delivery | Minimal workflow permissions, pinned actions, OIDC cloud trust | CI source prepared; cloud trust planned |
| Supply-chain controls | Dependency audit, secret scan, image scan, SBOM/provenance | Release gate work still required |
| Infrastructure as code | Reviewed staging/prod resources, environment isolation | Planned after provider selection |
| Observability | Structured request logs, traces, latency/error dashboard | Request logs implemented; dashboards planned |
| Reliability | SLOs, rollback and restore drill records | Planned; no reliability claims yet |
| Performance | Reproducible load script and raw results | Planned after ride endpoints |
| Mobile delivery | Device testing, signed builds, staged distribution | Planned |

## Performance and deployment measurements

Measure deployment frequency, commit-to-production lead time, failed deployment recovery time, change fail rate, and deployment rework rate. Start collecting when real deployments exist; no fabricated baseline or 'elite' label.

For the first ride-search benchmark: use synthetic, non-personal data; record dataset size, region, instance, database version, indexes, concurrency, warmup and duration. Proposed initial acceptance target: p95 search latency below 500 ms and error rate below 1% at 20 concurrent users for 5 minutes. This is a project target, not a measured result or universal industry benchmark. Booking tests must prove zero overselling, independent of latency. Run load tests on staging, never on the public service without an agreed load budget.

Resume bullets are earned after successful runs and inspectable artifacts. Do not claim CI/CD deployment, PostGIS matching, tracing, or performance gains merely because configuration or a plan exists.

Sources checked 2026-10-27:
- https://dora.dev/guides/dora-metrics/
- https://docs.github.com/en/actions/concepts/security/openid-connect
- https://fastapi.tiangolo.com/tutorial/testing/
- https://alembic.sqlalchemy.org/en/latest/tutorial.html
