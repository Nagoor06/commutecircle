"""CI-only identity transport for two isolated browsers. The real API validates the signed JWTs."""

import json
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import jwt
import uvicorn
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.staticfiles import StaticFiles
from sqlalchemy.engine import make_url

from app.main import create_app

url = os.environ["TEST_DATABASE_URL"]
if not (url == os.environ.get("DATABASE_URL") and make_url(url).database.endswith("_test")):
    raise RuntimeError("Use a disposable test database")
issuer = "https://identity.test/"
os.environ.update(
    OIDC_ISSUER=issuer,
    OIDC_AUDIENCE="cc-ci",
    OIDC_JWKS_URL=issuer + "keys",
    DOCS_OAUTH_CLIENT_ID="cc-browser-ci",
)
key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
app = create_app(url)
# Substitute only the offline issuer's JWKS lookup. Issuer, audience, RS256 and scopes still run.
app.state.token_verifier.jwks = SimpleNamespace(
    get_signing_key_from_jwt=lambda _: SimpleNamespace(key=key.public_key())
)
app.mount("/commutecircle", StaticFiles(directory="app/studio", html=True))
now = datetime.now(UTC)
tokens = {
    role: jwt.encode(
        dict(
            iss=issuer,
            aud="cc-ci",
            sub="ci-" + role,
            iat=now,
            exp=now + timedelta(minutes=15),
            scope="rides:read rides:write",
        ),
        key,
        algorithm="RS256",
        headers={"kid": "browser-test"},
    )
    for role in ("driver", "rider")
}
# Short-lived, runner-local test tokens. Do not include the file in evidence or artifacts.
dest = Path(os.environ["CC_BROWSER_IDENTITIES"])
fd = os.open(dest, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
with os.fdopen(fd, "w") as stream:
    json.dump(tokens, stream)
uvicorn.run(app, host="127.0.0.1", port=8765, access_log=False)
