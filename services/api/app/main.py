import asyncio
import os
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.auth.docs import configure_login_docs
from app.auth.tokens import TokenVerifier
from app.core.config import Settings
from app.db.session import build_engine
from app.middleware.request_logging import request_context
from app.services import location_retention, notification_outbox


def create_app(database_url: str | None = None) -> FastAPI:
    settings = Settings.from_environment(database_url)
    engine = build_engine(settings.database_url)

    @asynccontextmanager
    async def lifespan(app):
        cleanup = asyncio.create_task(location_retention.run(engine))
        alerts = (
            asyncio.create_task(notification_outbox.run(engine))
            if os.getenv("NOTIFICATION_WORKER_ENABLED", "true") == "true"
            else None
        )
        try:
            yield
        finally:
            cleanup.cancel()
            with suppress(asyncio.CancelledError):
                await cleanup
            if alerts:
                alerts.cancel()
                with suppress(asyncio.CancelledError):
                    await alerts
            engine.dispose()

    app = FastAPI(title="CommuteCircle API", version="0.2.2", lifespan=lifespan)
    if settings.web_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.web_origins),
            allow_methods=["GET", "POST", "PUT", "DELETE"],
            allow_headers=["Authorization", "Content-Type", "X-Studio-Session"],
            allow_credentials=True,
            max_age=600,
        )
    app.state.web_origins = settings.web_origins
    app.state.engine = engine
    app.state.token_verifier = TokenVerifier(settings) if settings.oidc_issuer else None
    app.middleware("http")(request_context)
    app.include_router(api_router)
    app.mount(
        "/studio", StaticFiles(directory=Path(__file__).parent / "studio", html=True), name="studio"
    )

    @app.get("/v1/studio-config", include_in_schema=False)
    def studio_config():
        return {
            "issuer": settings.oidc_issuer,
            "audience": settings.oidc_audience,
            "client_id": settings.docs_oauth_client_id,
            "journey_approvals": True,
            "studio_session_cache": True,
            "ride_help_enabled": bool(os.getenv("RIDE_HELP_URL")),
        }

    configure_login_docs(app, settings)
    return app
