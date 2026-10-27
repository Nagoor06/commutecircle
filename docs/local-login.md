# Sign in from the local API docs

This optional development UI uses Authorization Code + PKCE. It is not the mobile login screen, and no client secret is used. Backend token verification and required ride scopes are unchanged.

## Auth0 configuration

For initial local testing, use your existing public Native application. In its Settings, add these exact values (preserve any other entries):

| Setting | Value |
|---|---|
| Allowed Callback URLs | `http://localhost:8000/docs/oauth2-redirect` |
| Allowed Web Origins | `http://localhost:8000` |
| Allowed Origins (CORS) | `http://localhost:8000` |

Confirm Authorization Code is enabled under Advanced Settings / Grant Types and Token Endpoint Authentication Method is None. Enable your database connection for this application so users can sign up/sign in. Save changes. A separate development SPA client can be used instead by changing only DOCS_OAUTH_CLIENT_ID; keep development callbacks separate from production mobile configuration.

In the CommuteCircle API configuration, confirm Identifier `https://commutecircle-api`, RS256, and permissions `rides:read` and `rides:write`. Under API Settings → Application Access Policy, use per-app authorization for User-Delegated Access; then under Application Access grant this application User-Delegated Access with rides:read and rides:write. This grant is required separately from defining scopes. If RBAC is enabled, assign those permissions to the test user's role; the API checks the scope claim, not a permissions array. Defining a scope is not the same as granting it under RBAC.

## Local environment

Keep your three OIDC settings and add `DOCS_OAUTH_CLIENT_ID=<public application client ID>` to the root .env. Leave this variable unset to retain manual Bearer-token entry. Never add a client secret. Run:

```powershell
docker compose up -d --build
```

Database port publication has been removed from the default Compose configuration; the API still connects internally at db:5432. Direct host-based database tools need an explicitly configured optional port mapping.

## Login test

1. Open exactly http://localhost:8000/docs (not 127.0.0.1).
2. Click Authorize. The public client ID is prefilled. Leave any client-secret field blank.
3. Request openid, profile, rides:read and rides:write, then Authorize.
4. Sign up/log in in the Auth0 window and approve consent. Auth0 may always ask for consent for localhost.
5. Return to the docs and close the authorization dialog. Execute GET /v1/rides/mine. For a new user, expect HTTP 200 and an empty array.

Tokens remain in Swagger memory and are not persisted across page reloads. Swagger Logout clears its authorization; it does not necessarily end the Auth0 session. Do not paste access tokens into chat, commit them, or share login callback URLs containing codes.

Troubleshooting: callback mismatch means the exact URL is missing in Auth0; invalid_client means public-client/grant configuration needs checking; a CORS failure means Allowed Origins needs checking. A 403 after login usually means a required scope was not granted (check RBAC assignment). A 503 means missing provider configuration or unreachable signing keys. Give the error message/status when asking for help, without tokens or authorization codes.

Automated tests verify OpenAPI URLs, required scopes, PKCE configuration, callback page, nonpersistent token settings, and unchanged rejection of unauthenticated requests. Live Auth0 sign-in requires completing the above dashboard settings and has not been verified by the assistant.
