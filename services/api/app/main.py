from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.router import api_router
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
    app.middleware("http")(request_context)
    app.include_router(api_router)
    return app
