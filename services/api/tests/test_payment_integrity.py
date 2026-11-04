from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_journeys import listing

from app.auth.principal import Principal
from app.models import PaymentEntry, Ticket
from app.schemas.journey import Hold
from app.services import journeys


def user(name):
    return Principal("https://identity.example", name, frozenset())


def run_race(engine, actions):
    barrier = Barrier(len(actions))

    def run(action):
        with Session(engine) as session:
            barrier.wait(timeout=10)
            try:
                return action(session)
            except HTTPException as e:
                return e.status_code

    with ThreadPoolExecutor(len(actions)) as executor:
        futures = [executor.submit(run, action) for action in actions]
        return [future.result(timeout=20) for future in futures]


@pytest.fixture
def pg(client):
    if client.app.state.engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL row locks required; exercised in CI")
    return client.app.state.engine


def reserve(engine, jid, name="rider", a=0, b=1):
    with Session(engine) as session:
        return journeys.hold(
            session, jid, user(name), Hold(board=a, alight=b, checkout_id=uuid4())
        )["id"]


def test_ledger_retries_recover_hold_and_driver_refunds_fee(client, authenticated):
    jid = listing(client, authenticated).split("/")[-1]
    engine = client.app.state.engine
    tid = reserve(engine, jid)
    assert reserve(engine, jid) == tid
    with Session(engine) as session:
        for _ in range(2):
            journeys.act(session, jid, tid, user("rider"), "pay")
        assert journeys.act(session, jid, tid, user("rider"), "cancel")["net_paise"] == 1000
        journeys.cancel_all(session, jid, user("driver-a"))
        journeys.cancel_all(session, jid, user("driver-a"))
        entries = list(session.scalars(select(PaymentEntry).where(PaymentEntry.ticket_id == tid)))
        assert sum(e.amount for e in entries if e.kind == "charge") == 10000
        assert sum(e.amount for e in entries if e.kind != "charge") == 10000
        assert session.get(Ticket, tid).refund == 10000


def test_many_checkout_contenders_and_duplicate_pay(pg, client, authenticated):
    jid = listing(client, authenticated).split("/")[-1]

    def contender(n):
        def checkout(session):
            p = user("r" + str(n))
            t = journeys.hold(session, jid, p, Hold(board=0, alight=2, checkout_id=uuid4()))
            return journeys.act(session, jid, t["id"], p, "pay")

        return checkout

    results = run_race(pg, [contender(i) for i in range(8)])
    assert results.count(409) == 7
    winner = next(r for r in results if isinstance(r, dict))
    with Session(pg) as session:
        t = session.get(Ticket, winner["id"])
        p = user(t.rider)
    assert all(
        isinstance(r, dict)
        for r in run_race(pg, [lambda s: journeys.act(s, jid, t.id, p, "pay")] * 4)
    )
    with Session(pg) as session:
        assert len(list(session.scalars(select(PaymentEntry)))) == 1
        assert session.get(Ticket, t.id).charged == 20000


@pytest.mark.parametrize("other", ["driver_cancel", "rider_cancel"])
def test_pay_races_cancellation(pg, client, authenticated, other):
    jid = listing(client, authenticated).split("/")[-1]
    tid = reserve(pg, jid)
    cancel = (
        (lambda s: journeys.cancel_all(s, jid, user("driver-a")))
        if other == "driver_cancel"
        else (lambda s: journeys.act(s, jid, tid, user("rider"), "cancel"))
    )
    result = run_race(pg, [lambda s: journeys.act(s, jid, tid, user("rider"), "pay"), cancel])
    assert result[0] == 409 or result[0]["state"] == "paid"
    with Session(pg) as session:
        ticket = session.get(Ticket, tid)
        assert ticket.state in ("driver_cancelled", "rider_cancelled")
        assert ticket.charged - ticket.refund in ((0,) if other == "driver_cancel" else (0, 1000))
        entries = list(session.scalars(select(PaymentEntry)))
        assert (
            sum(e.amount if e.kind == "charge" else -e.amount for e in entries)
            == ticket.charged - ticket.refund
        )


def test_expired_payment_races_replacement_hold(pg, client, authenticated):
    jid = listing(client, authenticated).split("/")[-1]
    tid = reserve(pg, jid)
    with Session(pg) as session:
        session.get(Ticket, tid).expires = datetime.now(UTC) - timedelta(seconds=1)
        session.commit()

    def replace(session):
        t = journeys.hold(session, jid, user("new"), Hold(board=0, alight=1, checkout_id=uuid4()))
        return journeys.act(session, jid, t["id"], user("new"), "pay")

    result = run_race(pg, [lambda s: journeys.act(s, jid, tid, user("rider"), "pay"), replace])
    assert result[0] == 409 and result[1]["charged_paise"] == 10000
    with Session(pg) as session:
        assert session.get(Ticket, tid).charged == 0


def test_rider_and_driver_cancel_race_never_retains_fee(pg, client, authenticated):
    jid = listing(client, authenticated).split("/")[-1]
    tid = reserve(pg, jid)
    with Session(pg) as session:
        journeys.act(session, jid, tid, user("rider"), "pay")
    run_race(
        pg,
        [
            lambda s: journeys.act(s, jid, tid, user("rider"), "cancel"),
            lambda s: journeys.cancel_all(s, jid, user("driver-a")),
        ],
    )
    with Session(pg) as session:
        t = session.get(Ticket, tid)
        assert t.charged == t.refund == 10000
