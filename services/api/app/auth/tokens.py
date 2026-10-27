import jwt
from jwt import PyJWKClient
from jwt.exceptions import InvalidTokenError, PyJWKClientConnectionError, PyJWKClientError

from app.auth.principal import Principal
from app.core.config import Settings


class InvalidAccessToken(Exception):
    pass


class IdentityProviderUnavailable(Exception):
    pass


class TokenVerifier:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.jwks = PyJWKClient(settings.oidc_jwks_url, timeout=5, lifespan=300)

    def verify(self, token: str) -> Principal:
        try:
            header = jwt.get_unverified_header(token)
            if header.get("alg") != "RS256" or not isinstance(header.get("kid"), str):
                raise InvalidAccessToken()
            # Only this administrator-configured URL is used; token jku/x5u are ignored.
            key = self.jwks.get_signing_key_from_jwt(token).key
            claims = jwt.decode(
                token,
                key,
                algorithms=["RS256"],
                audience=self.settings.oidc_audience,
                issuer=self.settings.oidc_issuer,
                options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            )
            subject = claims["sub"]
            scope = claims.get("scope", "")
            if not isinstance(subject, str) or not subject.strip() or len(subject) > 255:
                raise InvalidAccessToken()
            if not isinstance(scope, str):
                raise InvalidAccessToken()
            return Principal(claims["iss"], subject, frozenset(scope.split()))
        except PyJWKClientConnectionError as exc:
            raise IdentityProviderUnavailable() from exc
        except (InvalidTokenError, PyJWKClientError) as exc:
            raise InvalidAccessToken() from exc
