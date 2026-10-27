"""These tests require PostgreSQL; SQLite cannot validate SELECT FOR UPDATE."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.principal import Principal
from app.models import Booking, Ride
from app.services import bookings as service


def principal(subject):
    return Principal("https://identity.example", subject, frozenset())


@pytest.fixture
def pg_engine(client):
    engine = client.app.state.engine
    if engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL concurrency test runs in CI")
    return engine


def concurrently(engine, actions):
    barrier = Barrier(len(actions))

    def run(action):
        with Session(engine) as session:
            barrier.wait(timeout=10)
            try:
                return action(session)
            except service.BookingError as error:
                return error.status

    with ThreadPoolExecutor(max_workers=len(actions)) as executor:
        futures = [executor.submit(run, action) for action in actions]
        return [future.result(timeout=20) for future in futures]


def request_id(engine, ride, user):
    with Session(engine) as session:
        return service.request_seat(session, principal(user), ride).id


def accept(booking):
    return lambda session: (
        service.transition(session, principal("driver-a"), booking, "accepted").status
    )


def test_two_accepts_one_seat(pg_engine, offered_ride):
    ids = [request_id(pg_engine, offered_ride, user) for user in ("a", "b")]
    results = concurrently(pg_engine, [accept(i) for i in ids])
    assert results.count("accepted") == 1
    assert results.count(409) == 1
    with Session(pg_engine) as session:
        assert session.get(Ride, offered_ride).seats_available == 0
        assert (
            session.scalar(
                select(func.count()).select_from(Booking).where(Booking.status == "accepted")
            )
            == 1
        )


def test_duplicate_requests_and_accepts(pg_engine, offered_ride):
    def request(session):
        return service.request_seat(session, principal("a"), offered_ride).id

    ids = concurrently(pg_engine, [request, request])
    assert ids[0] == ids[1]
    assert concurrently(pg_engine, [accept(ids[0]), accept(ids[0])]) == ["accepted", "accepted"]
    with Session(pg_engine) as session:
        assert session.get(Ride, offered_ride).seats_available == 0
        assert session.scalar(select(func.count()).select_from(Booking)) == 1


def test_duplicate_cancellation_restores_once(pg_engine, offered_ride):
    booking = request_id(pg_engine, offered_ride, "a")
    with Session(pg_engine) as session:
        accept(booking)(session)

    def cancel(session):
        return service.transition(session, principal("a"), booking, "cancelled").status

    assert concurrently(pg_engine, [cancel, cancel]) == ["cancelled", "cancelled"]
    with Session(pg_engine) as session:
        assert session.get(Ride, offered_ride).seats_available == 1


def test_accept_racing_cancellation(pg_engine, offered_ride):
    booking = request_id(pg_engine, offered_ride, "a")

    def cancel(session):
        return service.transition(session, principal("a"), booking, "cancelled").status

    results = concurrently(pg_engine, [accept(booking), cancel])
    assert results[0] in ("accepted", 409)
    assert results[1] == "cancelled"
    with Session(pg_engine) as session:
        assert session.get(Ride, offered_ride).seats_available == 1
        assert session.get(Booking, booking).status == "cancelled"
