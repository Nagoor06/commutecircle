"""Recover an existing Studio bearer with a browser session cookie and a separate binding."""

import re
from hmac import compare_digest
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials

from app.auth.dependencies import bearer, verify_access_token

PATH = "/v1/studio-session"
COOKIE = "cc_studio_session"
router = APIRouter(prefix=PATH, include_in_schema=False)


def browser_binding(request: Request) -> str:
    origin = request.headers.get("origin", "")
    binding = request.headers.get("x-studio-session", "")
    same_origin = origin == str(request.base_url).rstrip("/")
    if not origin or (not same_origin and origin not in request.app.state.web_origins):
        raise HTTPException(403, "Studio origin is not configured")
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", binding):
        raise HTTPException(400, "Studio session binding is missing or invalid")
    return binding


Binding = Annotated[str, Depends(browser_binding)]


def cookie_options(request: Request) -> dict:
    origin = request.headers["origin"]
    cross_origin = origin != str(request.base_url).rstrip("/")
    local_http = request.url.scheme == "http" and urlsplit(origin).hostname in {
        "localhost",
        "127.0.0.1",
        "::1",
    }
    return {
        "path": PATH,
        "httponly": True,
        "secure": cross_origin or not local_http,
        "samesite": "none" if cross_origin else "strict",
    }


def session_cookie(response: Response, request: Request, value: str, *, clear: bool = False):
    options = cookie_options(request)
    if clear:
        response.delete_cookie(COOKIE, **options)
    else:
        # A session cookie. The JWT's own expiry is checked again for every recovery.
        response.set_cookie(COOKIE, value, **options)
    if options["samesite"] == "none":
        # Python 3.12's cookie serializer does not yet accept the Partitioned attribute.
        response.headers["set-cookie"] += "; Partitioned"


@router.put("", status_code=204)
def save(
    request: Request,
    response: Response,
    binding: Binding,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
):
    if not credentials:
        raise HTTPException(401, "Bearer access token required")
    token = credentials.credentials
    verify_access_token(request, token)
    if len(token) > 3700:
        raise HTTPException(413, "Use identity-provider session recovery for this token")
    session_cookie(response, request, binding + "." + token)


def cached_token(request: Request, binding: str) -> str:
    saved, _, token = request.cookies.get(COOKIE, "").partition(".")
    if not compare_digest(saved.encode(), binding.encode()) or not token:
        raise HTTPException(401, "Studio session is unavailable")
    return token


@router.post("")
def restore(request: Request, binding: Binding):
    token = cached_token(request, binding)
    verify_access_token(request, token)
    return {"access_token": token}


@router.delete("", status_code=204)
def forget(request: Request, response: Response, binding: Binding):
    cached_token(request, binding)
    session_cookie(response, request, "", clear=True)
