# Verification record

Foundation PR #1 and GitHub run https://github.com/Nagoor06/commutecircle/actions/runs/40487374148 passed PostgreSQL migrations, tests, Docker build, coverage upload and GHCR publication.

The authenticated-rides tests cover actual RSA signature verification with mocked JWKS networking, invalid tokens, scopes, owner isolation, input validation, time conversion, search filters, database constraints and log privacy. Consult the milestone PR for its final GitHub CI result.

The live web pilot now uses GitHub Pages and Render. Later CI runs include
PostgreSQL races and browser workflows with test identities. See the
[14 November audit](audit-2026-11-14.md) for the current scope, fixes and limits.
Live identity-provider key rotation, Expo/device integration, backup restoration
and load benchmarks remain separate verification work. Browser emulation does
not establish native-device or production-performance guarantees.

Known dependency warning: Starlette deprecates HTTPX TestClient in favor of httpx2. Tests execute; evaluate the migration in a dependency update instead of hiding the warning.
