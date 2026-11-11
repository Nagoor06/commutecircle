from datetime import UTC, datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.orm import Session
from test_trip_sharing import start, view
from test_v2 import create_approval_journey, request, staff, verify_driver

from app.main import create_app
from app.models import Journey, PaymentEntry, Ticket


def test_expired_approval_allows_new_request_and_ride_cancellation_closes_it(client, authenticated):
    vehicle = verify_driver(client, authenticated)
    jid = create_approval_journey(client, authenticated, vehicle)
    path = f"/v1/journeys/{jid}"
    driver, rider = authenticated(), authenticated(subject="passenger")
    tid = request(client, authenticated, jid).json()["id"]
    client.post(f"{path}/tickets/{tid}/approve", headers=driver).raise_for_status()
    with Session(client.app.state.engine) as session, session.begin():
        session.get(Ticket, tid).expires = datetime.now(UTC) - timedelta(seconds=1)
    retry = request(client, authenticated, jid)
    assert retry.status_code == 201
    fresh = retry.json()["id"]
    assert fresh != tid
    assert request(client, authenticated, jid).json()["id"] == fresh
    client.post(path + "/cancel", headers=driver).raise_for_status()
    assert client.get(path + "/requests", headers=driver).json() == []
    states = {t["id"]: t["state"] for t in client.get(path, headers=rider).json()["tickets"]}
    assert states == {tid: "expired", fresh: "driver_cancelled"}


def test_registered_vehicle_visibility_and_checkout_after_review(client, authenticated):
    vehicle = verify_driver(client, authenticated)
    jid = create_approval_journey(client, authenticated, vehicle, minutes=15)
    driver, rider = authenticated(), authenticated(subject="passenger")
    path = f"/v1/journeys/{jid}"
    tid = request(client, authenticated, jid).json()["id"]
    client.post(f"{path}/tickets/{tid}/approve", headers=driver).raise_for_status()
    share = start(client, jid, None, driver)
    assert view(client, share).json()["vehicle"] == {
        "make": "Honda",
        "model": "City",
        "color": "White",
    }
    assert client.get(path, headers=rider).json()["vehicle_id"] is None
    client.post(
        f"/v1/staff/vehicles/{vehicle}/decision",
        headers=staff(authenticated),
        json={"decision": "suspended"},
    ).raise_for_status()
    assert client.get(path).status_code == 404
    assert client.post(path + "/quote", json={"board": 0, "alight": 1}).status_code == 404
    assert client.post(f"{path}/tickets/{tid}/sandbox-pay", headers=rider).status_code == 409
    assert client.post(f"{path}/tickets/{tid}/cancel", headers=rider).json()["charged_paise"] == 0


def test_boarded_passenger_prevents_predeparture_cancellation(client, authenticated):
    vehicle = verify_driver(client, authenticated)
    jid = create_approval_journey(client, authenticated, vehicle, minutes=15)
    driver, rider = authenticated(), authenticated(subject="passenger")
    tid = request(client, authenticated, jid).json()["id"]
    path = f"/v1/journeys/{jid}/tickets/{tid}"
    client.post(path + "/approve", headers=driver).raise_for_status()
    client.post(path + "/sandbox-pay", headers=rider).raise_for_status()
    pin = client.post(path + "/boarding-challenge", headers=rider).json()["pin"]
    client.post(path + "/board", headers=driver, json={"pin": pin}).raise_for_status()
    assert client.post(f"/v1/journeys/{jid}/cancel", headers=driver).status_code == 409
    assert (
        client.get(f"/v1/journeys/{jid}", headers=rider).json()["tickets"][0]["travel_state"]
        == "boarded"
    )


def test_zero_paise_segment_checkout_chat_and_local_time_search(client, authenticated):
    local = ZoneInfo("Asia/Kolkata")
    departure = (datetime.now(UTC) + timedelta(hours=2)).astimezone(local)
    stops = [
        {"name": n, "metres": m, "minutes": i}
        for i, (n, m) in enumerate([("A", 0), ("B", 1), ("C", 1000)])
    ]
    payload = {
        "capacity": 1,
        "price_paise": 100,
        "departure": departure.isoformat(),
        "stops": stops,
    }
    ride = client.post("/v1/journeys", headers=authenticated(), json=payload).json()
    jid = ride["id"]
    with Session(client.app.state.engine) as session:
        last = session.get(Journey, jid).last_stop_at
        assert (last if last.tzinfo else last.replace(tzinfo=UTC)) == departure + timedelta(
            minutes=2
        )
    search = client.post(
        "/v1/journeys/search",
        json={
            "after": (departure - timedelta(minutes=1)).isoformat(),
            "before": (departure + timedelta(minutes=1)).isoformat(),
        },
    )
    assert search.json()["items"][0]["journey"]["id"] == jid
    rider = authenticated(subject="rider")
    path = f"/v1/journeys/{jid}"
    hold = client.post(
        path + "/holds", headers=rider, json={"board": 0, "alight": 1, "checkout_id": str(uuid4())}
    ).json()
    ticket = f"{path}/tickets/{hold['id']}"
    for _ in range(2):
        receipt = client.post(ticket + "/sandbox-pay", headers=rider).json()
        assert receipt["confirmed"] and receipt["charged_paise"] == 0 and receipt["state"] == "paid"
    assert client.post(ticket + "/boarding-challenge", headers=rider).status_code == 409
    assert client.get(ticket + "/messages", headers=rider).json()["closed"] is False
    assert (
        client.get("/v1/me/conversations", headers=rider).json()["items"][0]["ticket_id"]
        == hold["id"]
    )
    with Session(client.app.state.engine) as session:
        assert session.scalars(select(PaymentEntry)).all() == []
    client.post(ticket + "/cancel", headers=rider).raise_for_status()
    assert client.get(ticket + "/messages", headers=rider).json()["closed"] is True


def test_circle_owner_keeps_role_and_invite_available(client, authenticated):
    driver = authenticated()
    circle = client.post("/v1/circles", headers=driver, json={"name": "Morning group"}).json()
    path = f"/v1/circles/{circle['id']}"
    invite = {"token": client.post(path + "/invitations", headers=driver).json()["token"]}
    assert (
        client.post("/v1/circle-invitations/redeem", headers=driver, json=invite).json()["role"]
        == "owner"
    )
    assert client.post(
        "/v1/circle-invitations/redeem", headers=authenticated(subject="member"), json=invite
    ).is_success
    assert client.get(path, headers=driver).json()["members"] == 2


def test_earlier_trips_follow_legacy_actions_and_filter_by_account(
    client, authenticated, offered_ride
):
    rider, driver = authenticated(subject="rider"), authenticated()
    ticket = client.post(f"/v1/rides/{offered_ride}/requests", headers=rider).json()
    path = "/v1/me/earlier-trips"
    assert client.get(path + "?role=passenger", headers=driver).json() == []
    current = client.get(path + "?role=driver", headers=driver).json()[0]
    assert (current["origin"], current["destination"]) == ("Public point A", "Public point B")
    assert current["requests"] == [{"id": ticket["id"], "status": "pending"}]
    client.post(f"/v1/bookings/{ticket['id']}/accept", headers=driver).raise_for_status()
    assert (
        client.get(path + "?role=passenger", headers=rider).json()[0]["requests"][0]["status"]
        == "accepted"
    )
    client.post(f"/v1/bookings/{ticket['id']}/cancel", headers=rider).raise_for_status()
    assert client.get(path + "?role=passenger", headers=rider).json() == []
    assert (
        client.get(path + "?role=passenger&history=true", headers=rider).json()[0]["requests"][0][
            "status"
        ]
        == "cancelled"
    )


def test_recurring_retries_reuse_template_and_materialized_journeys(client, authenticated):
    vehicle = verify_driver(client, authenticated)
    tomorrow = datetime.now(ZoneInfo("Asia/Kolkata")).date() + timedelta(days=1)
    payload = {
        "template_id": str(uuid4()),
        "vehicle_id": vehicle,
        "local_time": "09:00",
        "starts_on": tomorrow.isoformat(),
        "ends_on": tomorrow.isoformat(),
        "weekdays": [tomorrow.weekday()],
        "price_paise": 2500,
        "capacity": 1,
        "stops": [
            {"name": "A", "metres": 0, "minutes": 0},
            {"name": "B", "metres": 1000, "minutes": 10},
        ],
    }
    path, driver = "/v1/recurring-rides", authenticated()
    for _ in range(2):
        response = client.post(path, headers=driver, json=payload)
        assert response.status_code == 201
        assert response.json()["id"] == payload["template_id"]
    assert len(client.get(path, headers=driver).json()) == 1
    assert client.post(path, headers=driver, json=payload | {"capacity": 2}).status_code == 409
    generate = f"{path}/{payload['template_id']}/materialize"
    assert [client.post(generate, headers=driver).json()["count"] for _ in range(2)] == [1, 0]


def test_upgrade_repairs_existing_receipts_and_readiness(monkeypatch, tmp_path):
    url = f"sqlite:///{tmp_path / 'upgrade.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    config = Config("alembic.ini")
    command.upgrade(config, "0018")
    app = create_app(url)
    with TestClient(app) as test_client:
        assert test_client.get("/health/ready").status_code == 503
        with app.state.engine.begin() as db:
            db.execute(
                text(
                    "INSERT INTO journeys (id,issuer,driver,departure,last_stop_at,stops,"
                    "price_paise,capacity,cancelled) VALUES "
                    "('j','i','d',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'[]',100,1,true)"
                )
            )
            db.execute(
                text(
                    "INSERT INTO journey_tickets (id,journey_id,issuer,rider,board,alight,state,"
                    "expires,fare,charged,refund) VALUES "
                    "('p','j','i','a',0,1,'driver_cancelled',CURRENT_TIMESTAMP,100,100,100),"
                    "('r','j','i','b',0,1,'requested',CURRENT_TIMESTAMP,100,0,0)"
                )
            )
            db.execute(
                text("INSERT INTO payment_entries VALUES ('p','charge',100,'2026-01-01 09:00:00')")
            )
        command.upgrade(config, "head")
        assert test_client.get("/health/ready").is_success
        with Session(app.state.engine) as session:
            assert session.get(Ticket, "r").state == "driver_cancelled"
            assert session.get(Ticket, "p").confirmed_at == datetime(2026, 1, 1, 9)
