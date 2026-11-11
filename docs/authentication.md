# Authentication contract

The API verifies provider-issued RS256 JWT access tokens. The browser Studio and Swagger implement Authorization Code with PKCE.
The Auth0 administrator must still configure callbacks, client/API permissions,
user roles and staff access. Mobile token refresh/storage and native mobile
login are not implemented; no debug or self-issued access tokens are accepted.

Configure all three variables together: `OIDC_ISSUER` (exact HTTPS issuer, preserving its trailing slash), `OIDC_AUDIENCE` (a distinct API audience, not the mobile client ID), and `OIDC_JWKS_URL` (the provider's documented HTTPS public-key endpoint). The provider must issue space-separated `scope` claims containing `rides:read` and/or `rides:write`. ID tokens must target the client audience, not this API. This integration supports RS256 and a scope string; other provider formats require an adapter.

The verifier checks signature, the fixed algorithm, issuer, audience, expiry and issued-at, and requires a nonempty subject. The JWKS URL comes exclusively from operator configuration; token jku/x5u headers cannot select it. Key lookup uses a five-second timeout and the library's JWKS cache. No hardcoded signing keys, debug tokens, or caller-supplied user IDs are accepted.

No token or invalid token: 401. Missing scope: 403. Provider unconfigured or temporarily unavailable: 503 when credentials are presented. Partial/insecure configuration fails startup. Health and curated pickup-point reads remain unauthenticated. All ride routes require authentication.

Driver identity is the verified `(issuer, subject)` pair, stored internally and excluded from API ride responses and request logs. `rides:write` authorizes an offer; it is not driving-license or safety verification.

Tests sign JWTs with ephemeral RSA keys and replace only JWKS network lookup, so actual signature and claim validation still run. Live provider login/key rotation needs a separate staging test. Before public launch, configure the provider, implement Expo authorization-code + PKCE and secure token storage, verify logout/revocation behavior, and add rate limiting and key-refresh load tests.

Reference: https://pyjwt.readthedocs.io/en/latest/usage.html

Optional local Swagger PKCE sign-in is now implemented; see [local login](local-login.md). It uses only a public client ID. Live provider sign-in still needs dashboard configuration and user verification.

Auth0 application access: define API permissions, then grant the application **User-Delegated Access** to the API with those permissions in the API Application Access tab. A missing application grant causes Auth0 to reject the authorization request before issuing a token.

## Deprecated endpoints, unchanged compatibility

Old `/v1/rides`, `/v1/bookings` and older ride-details endpoints are
marked deprecated in OpenAPI **without removing them**. Existing clients,
stored legacy Ride/Booking rows, and migration history continue working.
All new V2 approval journeys use the canonical Journey/Ticket engine. Never
delete legacy rows or retire their endpoints before migrating all callers.


## Studio browser sessions

The Studio session cache at `/v1/studio-session` pairs an HttpOnly session cookie with a random binding held by the frontend. Saving the cookie requires a provider-issued bearer. Recovering it requires the same binding, an approved browser origin and a still-valid JWT. Ride endpoints continue to require a bearer. Cross-origin cookies use Secure, SameSite=None and Partitioned. The deployed Pages origin must be listed in `WEB_ORIGINS`.

A browser that declines the cookie, or uses an older API, resumes through a top-level Auth0 PKCE redirect with `prompt=none`. The original account and requested staff scope are checked during renewal. Access and refresh tokens stay out of local and session storage. Explicit sign-out invalidates the browser binding across tabs. The next interactive login after sign-out asks the provider for a fresh login. Separate browser profiles can use different accounts at the same time.
