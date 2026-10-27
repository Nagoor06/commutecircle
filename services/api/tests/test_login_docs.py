import pytest
from fastapi.testclient import TestClient

from app.main import create_app


def test_default_docs_retain_manual_bearer(client):
    schema = client.get("/openapi.json").json()
    assert schema["components"]["securitySchemes"]["HTTPBearer"]["type"] == "http"
    assert "initOAuth" not in client.get("/docs").text


def test_pkce_docs_use_configured_provider_without_secrets(monkeypatch, tmp_path):
    monkeypatch.setenv("OIDC_ISSUER", "https://issuer.example/")
    monkeypatch.setenv("OIDC_AUDIENCE", "https://test-api")
    monkeypatch.setenv("OIDC_JWKS_URL", "https://issuer.example/.well-known/jwks.json")
    monkeypatch.setenv("DOCS_OAUTH_CLIENT_ID", "public-test-client")
    with TestClient(create_app(f"sqlite:///{tmp_path / 'docs.db'}")) as client:
        schema = client.get("/openapi.json").json()
        assert client.get("/openapi.json").json() == schema
        flow = schema["components"]["securitySchemes"]["HTTPBearer"]["flows"]["authorizationCode"]
        assert flow["authorizationUrl"] == "https://issuer.example/authorize"
        assert flow["tokenUrl"] == "https://issuer.example/oauth/token"
        assert schema["paths"]["/v1/rides"]["post"]["security"] == [{"HTTPBearer": ["rides:write"]}]
        assert schema["paths"]["/v1/rides"]["get"]["security"] == [{"HTTPBearer": ["rides:read"]}]
        html = client.get("/docs").text
        assert '"clientId": "public-test-client"' in html
        assert '"usePkceWithAuthorizationCodeGrant": true' in html
        assert '"audience": "https://test-api"' in html
        assert '"persistAuthorization": false' in html
        assert '"clientSecret"' not in html
        assert client.get("/docs/oauth2-redirect").status_code == 200
        assert client.get("/v1/rides/mine").status_code == 401
        assert (
            client.get("/v1/rides/mine", headers={"Authorization": "Bearer invalid"}).status_code
            == 401
        )


def test_docs_client_requires_oidc(monkeypatch):
    monkeypatch.setenv("DOCS_OAUTH_CLIENT_ID", "public-client")
    with pytest.raises(RuntimeError, match="requires complete OIDC"):
        create_app("sqlite://")
