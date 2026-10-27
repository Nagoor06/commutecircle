from typing import Annotated

from fastapi import Depends, HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, SecurityScopes

from app.auth.principal import Principal
from app.auth.tokens import IdentityProviderUnavailable, InvalidAccessToken

bearer = HTTPBearer(auto_error=False)


def current_principal(
    request: Request,
    security_scopes: SecurityScopes,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> Principal:
    if credentials is None:
        raise HTTPException(
            401, "Bearer access token required", headers={"WWW-Authenticate": "Bearer"}
        )
    verifier = request.app.state.token_verifier
    if verifier is None:
        raise HTTPException(503, "Sign-in is not configured")
    try:
        principal = verifier.verify(credentials.credentials)
    except InvalidAccessToken as exc:
        raise HTTPException(
            401, "Invalid access token", headers={"WWW-Authenticate": "Bearer"}
        ) from exc
    except IdentityProviderUnavailable as exc:
        raise HTTPException(503, "Identity provider temporarily unavailable") from exc
    if not set(security_scopes.scopes).issubset(principal.scopes):
        raise HTTPException(403, "Required permission is missing")
    return principal


RideReader = Annotated[Principal, Security(current_principal, scopes=["rides:read"])]
RideWriter = Annotated[Principal, Security(current_principal, scopes=["rides:write"])]
