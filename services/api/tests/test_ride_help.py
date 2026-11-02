import io
import json

from app.api.routes import ride_help


def test_help_requires_reader_and_optional_service(client, authenticated, monkeypatch):
    data = {"question": "Is the fare real?"}
    monkeypatch.delenv("RIDE_HELP_URL", raising=False)
    assert client.post("/v1/help/ask", json=data).status_code == 401
    assert client.post("/v1/help/ask", json=data, headers=authenticated()).status_code == 503
    monkeypatch.setenv("RIDE_HELP_URL", "http://ride-help:8090/ask")

    def respond(request, timeout):
        assert json.loads(request.data) == data
        assert not request.get_header("Authorization")
        return io.BytesIO(b'{"answer":"No evidence","status":"no_evidence","sources":[]}')

    monkeypatch.setattr(ride_help, "urlopen", respond)
    assert (
        client.post("/v1/help/ask", json=data, headers=authenticated()).json()["status"]
        == "no_evidence"
    )
    assert (
        client.post("/v1/help/ask", json={"question": "  "}, headers=authenticated()).status_code
        == 422
    )
