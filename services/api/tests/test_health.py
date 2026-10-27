from fastapi.testclient import TestClient

from app.main import create_app


def test_health(client):
    assert client.get("/health/live").status_code == 200
    assert client.get("/health/ready").json() == {"status": "ready"}


def test_unmigrated_database_is_not_ready(tmp_path):
    with TestClient(create_app(f"sqlite:///{tmp_path / 'empty.db'}")) as client:
        assert client.get("/health/live").status_code == 200
        response = client.get("/health/ready")
        assert response.status_code == 503
        assert response.json() == {"status": "unavailable"}
