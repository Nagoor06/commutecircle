import pytest

from app.core.config import Settings
from app.main import create_app


def test_requires_database_configuration(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        create_app()


def test_settings_repr_hides_database_credentials():
    assert "secret" not in repr(Settings(database_url="postgresql://user:secret@db/app"))
