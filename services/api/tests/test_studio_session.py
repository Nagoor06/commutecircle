from datetime import UTC, datetime, timedelta

import jwt
from jwt.exceptions import PyJWKClientConnectionError

PATH = "/v1/studio-session"
ORIGIN = "https://testserver"
URL = ORIGIN + PATH
BINDING = {"Origin": ORIGIN, "X-Studio-Session": "A" * 43}


def test_session_round_trip_and_logout(client, authenticated):
    credentials = authenticated()
    response = client.put(URL, headers=BINDING | credentials)
    assert response.status_code == 204
    cookie = response.headers["set-cookie"]
    for attribute in ["HttpOnly", "Secure", "SameSite=strict", "Path=" + PATH]:
        assert attribute in cookie
    restored = client.post(URL, headers=BINDING)
    assert restored.json() == {"access_token": credentials["Authorization"].split()[1]}
    assert restored.headers["cache-control"] == "no-store"
    assert client.get(ORIGIN + "/v1/rides/mine").status_code == 401
    assert client.delete(URL, headers=BINDING).status_code == 204
    assert client.post(URL, headers=BINDING).status_code == 401


def test_both_the_origin_and_binding_are_required(client, authenticated):
    assert client.put(URL, headers=BINDING | authenticated()).status_code == 204
    assert client.post(URL).status_code == 403
    assert client.post(URL, headers={"Origin": ORIGIN}).status_code == 400
    different = BINDING | {"X-Studio-Session": "B" * 43}
    for method in (client.post, client.delete):
        assert (
            method(URL, headers=BINDING | {"Origin": "https://elsewhere.example"}).status_code
            == 403
        )
        assert method(URL, headers=different).status_code == 401
    assert client.post(URL, headers=BINDING).status_code == 200


def test_cross_origin_session_cookie_is_partitioned_and_removed_in_same_partition(
    client, authenticated
):
    front = "https://pages.example"
    client.app.state.web_origins = (front,)
    headers = BINDING | {"Origin": front}
    saved = client.put(URL, headers=headers | authenticated())
    assert saved.status_code == 204
    assert client.post(URL, headers=headers).status_code == 200
    cleared = client.delete(URL, headers=headers)
    for response in [saved, cleared]:
        for attribute in ["HttpOnly", "Secure", "SameSite=none", "Partitioned", "Path=" + PATH]:
            assert attribute in response.headers["set-cookie"]
    assert client.post(URL, headers=headers).status_code == 401


def test_expiry_is_checked_again_and_the_provider_can_recover(client, authenticated, monkeypatch):
    assert client.put(URL, headers=BINDING).status_code == 401
    assert client.put(URL, headers=BINDING | authenticated(exp=1)).status_code == 401
    assert client.put(URL, headers=BINDING | authenticated()).status_code == 204
    lookup = client.app.state.token_verifier.jwks.get_signing_key_from_jwt
    lookup.side_effect = PyJWKClientConnectionError("offline")
    assert client.post(URL, headers=BINDING).status_code == 503
    lookup.side_effect = None
    assert client.post(URL, headers=BINDING).status_code == 200

    class Later(datetime):
        @classmethod
        def now(cls, tz=UTC):
            return datetime.now(tz) + timedelta(minutes=10)

    monkeypatch.setattr(jwt.api_jwt, "datetime", Later)
    assert client.post(URL, headers=BINDING).status_code == 401
    assert client.delete(URL, headers=BINDING).status_code == 204


def test_oversized_and_invalid_tokens_are_not_cached(client, authenticated):
    assert client.put(URL, headers=BINDING | {"Authorization": "Bearer invalid"}).status_code == 401
    assert client.put(URL, headers=BINDING | authenticated(extra="a" * 3500)).status_code == 413
    assert client.post(URL, headers=BINDING).status_code == 401
