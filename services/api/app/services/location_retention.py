import asyncio
import logging

from app.services.trip_sharing import purge_locations

logger = logging.getLogger(__name__)


async def run(engine):
    """Cleanup while the API is running; access expiry never depends on this task."""
    while True:
        try:
            await asyncio.to_thread(purge_locations, engine)
        except Exception:
            # Do not include database parameters, coordinates, or tokens in logs.
            logger.warning("Expired location cleanup failed; retrying in one minute")
        await asyncio.sleep(60)
