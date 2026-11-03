def driver_url(url: str) -> str:
    """Managed PostgreSQL providers generally return a URL without the psycopg driver name."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix) :]
    return url
