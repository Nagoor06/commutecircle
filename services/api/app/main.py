from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.auth.docs import configure_login_docs
from app.auth.tokens import TokenVerifier
from app.core.config import Settings
from app.db.session import build_engine
from app.middleware.request_logging import request_context


def create_app(database_url: str | None = None) -> FastAPI:
    settings = Settings.from_environment(database_url)
    engine = build_engine(settings.database_url)

    @asynccontextmanager
    async def lifespan(app):
        yield
        engine.dispose()

    app = FastAPI(title="CommuteCircle API", version="0.1.0", lifespan=lifespan)
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
        }

    configure_login_docs(app, settings)
    return app
