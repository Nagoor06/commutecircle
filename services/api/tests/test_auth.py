from datetime import UTC, datetime, timedelta

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.exceptions import PyJWKClientConnectionError, PyJWKClientError


def test_missing_token(client):
    response = client.get("/v1/rides/mine")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_unconfigured_provider_fails_closed(client):
    assert (
        client.get("/v1/rides/mine", headers={"Authorization": "Bearer token"}).status_code == 503
    )


def test_valid_token(client, authenticated):
    assert client.get("/v1/rides/mine", headers=authenticated()).status_code == 200


@pytest.mark.parametrize(
    "changes",
    [
        {"iss": "https://attacker.example"},
        {"aud": "another-api"},
        {"exp": 1},
        {"iat": 9999999999},
        {"sub": ""},
        {"scope": ["rides:read"]},
    ],
)
def test_invalid_claims(client, authenticated, changes):
    response = client.get("/v1/rides/mine", headers=authenticated(**changes))
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid access token"}


def test_missing_permission(client, authenticated):
    assert client.get("/v1/rides/mine", headers=authenticated(scope="")).status_code == 403


@pytest.mark.parametrize(
    "kind", ["malformed", "unsigned", "wrong-signature", "missing-exp", "missing-kid"]
)
def test_bad_tokens(client, authenticated, signing_key, kind):
    claims = {
        "iss": "https://identity.example",
        "aud": "commutecircle-api",
        "sub": "driver",
        "iat": datetime.now(UTC),
        "exp": datetime.now(UTC) + timedelta(minutes=5),
        "scope": "rides:read",
    }
    key = signing_key
    if kind == "missing-exp":
        claims.pop("exp")
    if kind == "wrong-signature":
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    if kind == "malformed":
        token = "not-a-jwt"
    elif kind == "unsigned":
        token = jwt.encode(claims, "", algorithm="none", headers={"kid": "test-key"})
    else:
        token = jwt.encode(
            claims,
            key,
            algorithm="RS256",
            headers={} if kind == "missing-kid" else {"kid": "test-key"},
        )
    assert (
        client.get("/v1/rides/mine", headers={"Authorization": f"Bearer {token}"}).status_code
        == 401
    )


@pytest.mark.parametrize(
    "error,status",
    [(PyJWKClientConnectionError("offline"), 503), (PyJWKClientError("unknown kid"), 401)],
)
def test_key_resolution_failure(client, authenticated, error, status):
    client.app.state.token_verifier.jwks.get_signing_key_from_jwt.side_effect = error
    assert client.get("/v1/rides/mine", headers=authenticated()).status_code == status
