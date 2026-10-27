"""Optional OAuth UI for local API testing; token verification stays unchanged."""

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

from app.core.config import Settings


def configure_login_docs(app: FastAPI, settings: Settings) -> None:
    if not settings.docs_oauth_client_id:
        return
    issuer = settings.oidc_issuer.rstrip("/")
    app.swagger_ui_init_oauth = {
        "clientId": settings.docs_oauth_client_id,
        "appName": "CommuteCircle API testing",
        "usePkceWithAuthorizationCodeGrant": True,
        "scopes": "openid profile rides:read rides:write",
        "additionalQueryStringParams": {"audience": settings.oidc_audience},
    }
    # Access tokens stay in Swagger's memory, not persisted across reloads.
    app.swagger_ui_parameters = {"persistAuthorization": False}

    def oauth_openapi():
        if app.openapi_schema is None:
            schema = get_openapi(title=app.title, version=app.version, routes=app.routes)
            # Keep the existing scheme name and per-operation required scopes.
            # Runtime HTTPBearer extraction and JWT validation do not change.
            schema["components"]["securitySchemes"]["HTTPBearer"] = {
                "type": "oauth2",
                "flows": {
                    "authorizationCode": {
                        "authorizationUrl": f"{issuer}/authorize",
                        "tokenUrl": f"{issuer}/oauth/token",
                        "scopes": {
                            "openid": "Sign in",
                            "profile": "Basic profile",
                            "rides:read": "Search and view rides",
                            "rides:write": "Create ride offers",
                        },
                    }
                },
            }
            app.openapi_schema = schema
        return app.openapi_schema

    app.openapi = oauth_openapi
