import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text


def test_existing_ride_capacity_is_backfilled(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    config = Config("alembic.ini")
    command.upgrade(config, "0002")
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(
            text("INSERT INTO pickup_points VALUES (1, 'A', 'Demo', 0, 0), (2, 'B', 'Demo', 0, 1)")
        )
        connection.execute(
            text(
                "INSERT INTO rides (id, driver_issuer, driver_subject, origin_id, "
                "destination_id, departure_at, seats_available) "
                "VALUES ('existing', 'issuer', 'driver', 1, 2, '2099-01-01', 3)"
            )
        )
    command.upgrade(config, "head")
    command.check(config)
    with engine.connect() as connection:
        assert connection.execute(
            text("SELECT seats_available, seats_capacity FROM rides WHERE id='existing'")
        ).one() == (3, 3)
    with engine.begin() as connection:
        connection.execute(text("UPDATE rides SET seats_available=0"))
    with pytest.raises(RuntimeError, match="sold-out"):
        command.downgrade(config, "0002")
    with engine.begin() as connection:
        connection.execute(text("UPDATE rides SET seats_available=3"))
    command.downgrade(config, "0002")
    command.upgrade(config, "head")
    engine.dispose()
