import json
import logging
from time import perf_counter
from uuid import uuid4

logger = logging.getLogger("commutecircle.requests")


async def request_context(request, call_next):
    request_id = str(uuid4())
    started = perf_counter()
    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
        response.headers["X-Request-ID"] = request_id
        return response
    finally:
        # Never log query strings, bodies, credentials, or user coordinates.
        route = request.scope.get("route")
        logger.info(
            json.dumps(
                {
                    "request_id": request_id,
                    "method": request.method,
                    "route": getattr(route, "path", "unmatched"),
                    "status": status,
                    "duration_ms": round((perf_counter() - started) * 1000, 2),
                }
            )
        )
