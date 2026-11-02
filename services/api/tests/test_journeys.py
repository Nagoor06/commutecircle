from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.auth.principal import Principal
from app.models.journey import Journey, Ticket
from app.schemas.journey import Hold
from app.services import journeys


def listing(client, authenticated):
    response = client.post(
        "/v1/journeys",
        headers=authenticated(),
        json=dict(
            capacity=1,
            price_paise=20000,
            departure=(datetime.now(UTC) + timedelta(hours=4)).isoformat(),
            stops=[dict(name=n, metres=i * 20000, minutes=i * 30) for i, n in enumerate("ABC")],
        ),
    )
    assert response.status_code == 201
    return "/v1/journeys/" + response.json()["id"]


def test_disjoint_inventory_refunds_retries(client, authenticated):
    base = listing(client, authenticated)

    def reserve(user, a, b):
        return client.post(
            base + "/holds",
            headers=authenticated(subject=user),
            json={"board": a, "alight": b, "checkout_id": str(uuid4())},
        )

    def post(path, user):
        return client.post(path, headers=authenticated(subject=user))

    first = reserve("p1", 0, 1).json()
    assert first["charged_paise"] == 0 and first["fare_paise"] == 10000
    assert reserve("p2", 0, 2).status_code == 409
    second = reserve("p2", 1, 2).json()
    t1 = base + "/tickets/" + first["id"]
    t2 = base + "/tickets/" + second["id"]
    assert post(t1 + "/sandbox-pay", "p2").status_code == 404
    for _ in range(2):
        assert post(t1 + "/sandbox-pay", "p1").json()["charged_paise"] == 10000
    assert post(t2 + "/sandbox-pay", "p2").is_success
    assert post(t1 + "/cancel", "p1").json()["refund_paise"] == 9000
    assert reserve("p3", 0, 1).is_success
    for _ in range(2):
        assert client.post(base + "/cancel", headers=authenticated()).is_success
    history = client.get("/v1/journeys/mine", headers=authenticated(subject="p2")).json()[0]
    assert history["tickets"][0]["refund_paise"] == 10000
    assert reserve("p4", 0, 1).status_code == 409


def test_expired_checkout_cannot_charge(client, authenticated):
    base = listing(client, authenticated)
    data = dict(board=0, alight=2, checkout_id=str(uuid4()))
    for _ in range(2):
        assert (
            client.post(base + "/holds", headers=authenticated(subject="p1"), json=data).json()[
                "id"
            ]
            == data["checkout_id"]
        )
    with Session(client.app.state.engine) as s:
        s.get(Ticket, data["checkout_id"]).expires = datetime.now(UTC) - timedelta(seconds=1)
        s.commit()
    assert (
        client.post(
            base + "/tickets/" + data["checkout_id"] + "/sandbox-pay",
            headers=authenticated(subject="p1"),
        ).status_code
        == 409
    )
    assert client.post(
        base + "/holds",
        headers=authenticated(subject="p2"),
        json=data | {"checkout_id": str(uuid4())},
    ).is_success


def test_confirm_early_exit(client, authenticated):
    base = listing(client, authenticated)
    hold = client.post(
        base + "/holds",
        headers=authenticated(subject="p1"),
        json={"board": 0, "alight": 2, "checkout_id": str(uuid4())},
    ).json()
    path = base + "/tickets/" + hold["id"]
    client.post(path + "/sandbox-pay", headers=authenticated(subject="p1")).raise_for_status()
    with Session(client.app.state.engine) as s:
        s.get(Journey, base.split("/")[-1]).departure = datetime.now(UTC) - timedelta(minutes=20)
        s.commit()
    for _ in range(2):
        result = client.post(path + "/exit", headers=authenticated(), json={"stop": 1})
        assert result.json()["refund_paise"] == 10000
    assert (
        client.post(
            base + "/quote", headers=authenticated(), json={"board": 1, "alight": 2}
        ).json()["seats_available"]
        == 1
    )


def test_payment_race(client, authenticated):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    engine = client.app.state.engine
    if engine.dialect.name != "postgresql":
        pytest.skip("real PostgreSQL locks required")
    jid = listing(client, authenticated).split("/")[-1]
    barrier = Barrier(2)

    def checkout(user):
        principal = Principal("https://identity.example", user, frozenset())
        with Session(engine) as session:
            barrier.wait(timeout=10)
            try:
                ticket = journeys.hold(
                    session, jid, principal, Hold(board=0, alight=1, checkout_id=uuid4())
                )
                return journeys.act(session, jid, ticket["id"], principal, "pay")["charged_paise"]
            except HTTPException as exc:
                assert exc.status_code == 409
                return 0

    with ThreadPoolExecutor(2) as pool:
        assert sorted(pool.map(checkout, ["one", "two"])) == [0, 10000]


@pytest.mark.parametrize(("hours", "expected"), [(24, 0), (23.99, 1000), (2, 1000), (1.99, 2500)])
def test_cancellation_bands(hours, expected):
    assert journeys.fee(10000, timedelta(hours=hours)) == expected
