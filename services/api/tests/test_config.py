import pytest

from app.core.config import Settings
from app.main import create_app


def test_requires_database_configuration(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        create_app()


def test_settings_repr_hides_database_credentials():
    assert "secret" not in repr(Settings(database_url="postgresql://user:secret@db/app"))


@pytest.mark.parametrize(
    "values",
    [
        {"OIDC_ISSUER": "https://issuer.example"},
        {
            "OIDC_ISSUER": "http://issuer.example",
            "OIDC_AUDIENCE": "api",
            "OIDC_JWKS_URL": "https://issuer.example/jwks",
        },
        {
            "OIDC_ISSUER": "https://issuer.example",
            "OIDC_AUDIENCE": "api",
            "OIDC_JWKS_URL": "https://user:password@issuer.example/jwks",
        },
    ],
)
def test_invalid_oidc_configuration(monkeypatch, values):
    for key, value in values.items():
        monkeypatch.setenv(key, value)
    with pytest.raises(RuntimeError):
        Settings.from_environment("sqlite://")


def test_oidc_configuration(monkeypatch):
    monkeypatch.setenv("OIDC_ISSUER", "https://issuer.example")
    monkeypatch.setenv("OIDC_AUDIENCE", "api")
    monkeypatch.setenv("OIDC_JWKS_URL", "https://issuer.example/jwks")
    assert Settings.from_environment("sqlite://").oidc_audience == "api"
