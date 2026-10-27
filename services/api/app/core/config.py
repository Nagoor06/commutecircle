import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Settings:
    database_url: str = field(repr=False)

    @classmethod
    def from_environment(cls, database_url: str | None = None):
        url = database_url or os.environ.get("DATABASE_URL")
        if not url:
            raise RuntimeError("DATABASE_URL is required; see .env.example")
        return cls(database_url=url)
