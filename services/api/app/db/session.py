from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session


def build_engine(url: str) -> Engine:
    return create_engine(url, pool_pre_ping=True)


def get_session(request: Request) -> Iterator[Session]:
    with Session(request.app.state.engine) as session:
        yield session
