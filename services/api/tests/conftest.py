import os

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.main import create_app
from app.models import PickupPoint


@pytest.fixture
def client(tmp_path, monkeypatch):
    url = os.getenv("TEST_DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setenv("DATABASE_URL", url)
    command.upgrade(Config("alembic.ini"), "head")
    app = create_app(url)
    with Session(app.state.engine) as session:
        session.execute(delete(PickupPoint))
        session.add_all(
            [
                PickupPoint(name="Public point A", city="TestCity", latitude=12.0, longitude=77.0),
                PickupPoint(name="Public point B", city="OtherCity", latitude=13.0, longitude=78.0),
            ]
        )
        session.commit()
    with TestClient(app) as test_client:
        yield test_client
