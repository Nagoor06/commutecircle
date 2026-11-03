"""Single entry point for a hosted API with a managed PostgreSQL connection."""

import os

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.db.url import driver_url


def main():
    engine = create_engine(driver_url(os.environ["DATABASE_URL"]))
    if engine.dialect.name != "postgresql":
        raise RuntimeError("The hosted service requires PostgreSQL")
    # Serialize migration on deployments with overlapping instances.
    with engine.connect() as connection:
        connection.execute(text("SELECT pg_advisory_lock(184940007)"))
        try:
            command.upgrade(Config("alembic.ini"), "head")
        finally:
            connection.execute(text("SELECT pg_advisory_unlock(184940007)"))
    engine.dispose()
    os.execvp(
        "uvicorn",
        [
            "uvicorn",
            "app.main:create_app",
            "--factory",
            "--host",
            "0.0.0.0",
            "--port",
            os.environ.get("PORT", "8000"),
            "--no-access-log",
            "--log-config",
            "app/logging.json",
        ],
    )


if __name__ == "__main__":
    main()
