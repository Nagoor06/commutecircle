# Authentication contract

The API verifies provider-issued RS256 JWT access tokens. Live login, registration, a sign-in UI and refresh-token storage are not implemented. No identity-provider account has been provisioned.

Configure all three variables together: `OIDC_ISSUER` (exact HTTPS issuer, preserving its trailing slash), `OIDC_AUDIENCE` (a distinct API audience, not the mobile client ID), and `OIDC_JWKS_URL` (the provider's documented HTTPS public-key endpoint). The provider must issue space-separated `scope` claims containing `rides:read` and/or `rides:write`. ID tokens must target the client audience, not this API. This integration supports RS256 and a scope string; other provider formats require an adapter.

The verifier checks signature, the fixed algorithm, issuer, audience, expiry and issued-at, and requires a nonempty subject. The JWKS URL comes exclusively from operator configuration; token jku/x5u headers cannot select it. Key lookup uses a five-second timeout and the library's JWKS cache. No hardcoded signing keys, debug tokens, or caller-supplied user IDs are accepted.

No token or invalid token: 401. Missing scope: 403. Provider unconfigured or temporarily unavailable: 503 when credentials are presented. Partial/insecure configuration fails startup. Health and curated pickup-point reads remain unauthenticated. All ride routes require authentication.

Driver identity is the verified `(issuer, subject)` pair, stored internally and excluded from API ride responses and request logs. `rides:write` authorizes an offer; it is not driving-license or safety verification.

Tests sign JWTs with ephemeral RSA keys and replace only JWKS network lookup, so actual signature and claim validation still run. Live provider login/key rotation needs a separate staging test. Before public launch, configure the provider, implement Expo authorization-code + PKCE and secure token storage, verify logout/revocation behavior, and add rate limiting and key-refresh load tests.

Reference: https://pyjwt.readthedocs.io/en/latest/usage.html
