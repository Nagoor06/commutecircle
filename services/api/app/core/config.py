import os
from dataclasses import dataclass, field
from urllib.parse import urlsplit


@dataclass(frozen=True)
class Settings:
    database_url: str = field(repr=False)
    oidc_issuer: str = ""
    oidc_audience: str = ""
    oidc_jwks_url: str = ""
    docs_oauth_client_id: str = ""

    @classmethod
    def from_environment(cls, database_url: str | None = None):
        url = database_url or os.environ.get("DATABASE_URL")
        if not url:
            raise RuntimeError("DATABASE_URL is required; see .env.example")
        issuer = os.getenv("OIDC_ISSUER", "").strip()
        audience = os.getenv("OIDC_AUDIENCE", "").strip()
        jwks = os.getenv("OIDC_JWKS_URL", "").strip()
        if any((issuer, audience, jwks)):
            if not all((issuer, audience, jwks)):
                raise RuntimeError("Set all three OIDC settings or leave all unset")
            for endpoint in (issuer, jwks):
                parsed = urlsplit(endpoint)
                if (
                    parsed.scheme != "https"
                    or not parsed.hostname
                    or parsed.username
                    or parsed.password
                ):
                    raise RuntimeError("OIDC endpoints must be HTTPS URLs without credentials")
        docs_client = os.getenv("DOCS_OAUTH_CLIENT_ID", "").strip()
        if docs_client and not issuer:
            raise RuntimeError("DOCS_OAUTH_CLIENT_ID requires complete OIDC configuration")
        return cls(url, issuer, audience, jwks, docs_client)
