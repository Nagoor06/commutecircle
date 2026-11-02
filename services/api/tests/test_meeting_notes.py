import io
import json

from app.services import meeting_notes


def test_translation_is_authenticated_optional_and_scoped(client, authenticated, monkeypatch):
    url = "/v1/meeting-notes/translate"
    data = {"landmark": "Gate 2", "language": "Telugu"}
    assert client.post(url, json=data).status_code == 401
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert client.post(url, json=data, headers=authenticated()).status_code == 503
    monkeypatch.setenv("OPENAI_API_KEY", "test-only")

    def provider(request, timeout):
        payload = json.loads(request.data)
        assert payload["input"] == "Gate 2" and payload["store"] is False
        return io.BytesIO(
            json.dumps(
                {
                    "status": "completed",
                    "output": [
                        {"type": "message", "content": [{"type": "output_text", "text": "గేట్ 2"}]}
                    ],
                }
            ).encode()
        )

    monkeypatch.setattr(meeting_notes, "urlopen", provider)
    assert client.post(url, json=data, headers=authenticated()).json() == {"translation": "గేట్ 2"}
