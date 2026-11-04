"""Read-only MCP tools for the guide and public catalogue; no booking credentials."""

import json
import os
import sqlite3
from pathlib import Path
from threading import Lock
from typing import Annotated
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from mcp.server import MCPServer
from mcp.types import ToolAnnotations
from pydantic import Field
from server import graph

server = MCPServer(
    "CommuteCircle",
    instructions="Use public stops only. These tools cannot book, pay, cancel or read private profiles or chats.",
)
readonly = ToolAnnotations(
    readOnlyHint=True, destructiveHint=False, idempotentHint=True
)
_inference = Lock()


@server.tool(annotations=readonly)
def read_rider_guide() -> str:
    """Read the versioned source used by the ride assistant, without requiring a model."""
    return Path(__file__).with_name("guide.md").read_text(encoding="utf-8")


@server.tool(annotations=readonly)
def ask_rider_guide(
    question: Annotated[str, Field(min_length=1, max_length=300)],
) -> dict:
    """Answer a general commute question with local Ollama, vector retrieval and source links."""
    if not _inference.acquire(blocking=False):
        return {
            "status": "unavailable",
            "answer": "The assistant is busy. Read the rider guide.",
            "sources": [],
        }
    try:
        return graph().invoke({"question": question})["answer"]
    except (OSError, ValueError, KeyError, TypeError, sqlite3.Error):
        return {
            "status": "unavailable",
            "answer": "Local Ollama is unavailable. Read the rider guide.",
            "sources": [],
        }
    finally:
        _inference.release()


@server.tool(
    annotations=ToolAnnotations(
        readOnlyHint=True, destructiveHint=False, openWorldHint=True
    )
)
def search_public_rides(
    origin: Annotated[str, Field(min_length=1, max_length=80)],
    destination: Annotated[str, Field(min_length=1, max_length=80)],
    max_fare_rupees: Annotated[int | None, Field(ge=0, le=100000)] = None,
) -> dict:
    """Find currently available public ride segments by public stop name. Never reserves a seat."""
    base = os.getenv(
        "COMMUTECIRCLE_API_ORIGIN", "https://commutecircle-staging-api.onrender.com"
    ).rstrip("/")
    url = urlsplit(base)
    if (
        url.username
        or url.password
        or url.query
        or url.fragment
        or url.path
        or not url.hostname
        or (
            url.scheme != "https"
            and not (
                url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1")
            )
        )
    ):
        raise ValueError(
            "Configure an HTTPS API origin or a loopback development origin."
        )
    query = {"origin": {"name": origin}, "destination": {"name": destination}}
    if max_fare_rupees is not None:
        query["max_fare_paise"] = max_fare_rupees * 100
    request = Request(
        base + "/v1/journeys/search",
        data=json.dumps(query).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=20) as response:
            return json.load(response)
    except (OSError, ValueError):
        return {"status": "unavailable", "items": [], "more": False}


if __name__ == "__main__":
    server.run(transport="stdio")
