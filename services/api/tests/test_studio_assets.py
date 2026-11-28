import mimetypes

from fastapi.testclient import TestClient

from app.main import create_app


def test_booking_illustration_has_image_type_without_system_mime_entry(monkeypatch):
    mimetypes.init()
    monkeypatch.delitem(mimetypes.types_map, ".webp", raising=False)
    client = TestClient(create_app("sqlite://"))
    response = client.get("/studio/assets/city-commute.webp")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/webp"
    assert response.content[:4] == b"RIFF"
    assert response.content[8:12] == b"WEBP"
    client.close()
