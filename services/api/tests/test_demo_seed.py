import json
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.cli.seed_demo import DemoDataConflict, main, seed_demo_points
from app.data.demo_pickup_points import DEMO_POINTS
from app.models import PickupPoint
from app.schemas.ride import RideCreate


def test_repeatable_seed_preserves_existing_points(client):
    engine = client.app.state.engine
    first = seed_demo_points(engine)
    second = seed_demo_points(engine)
    assert first["pickup_points"] == second["pickup_points"]
    assert len(first["pickup_points"]) == 2
    with Session(engine) as session:
        assert session.scalar(select(func.count()).select_from(PickupPoint)) == 4
        assert session.get(PickupPoint, 1).name == "Public point A"
    example = RideCreate.model_validate(second["example_ride"])
    assert example.departure_at > datetime.now(UTC)
    assert example.origin_id != example.destination_id


def test_conflict_rolls_back_entire_seed(client):
    engine = client.app.state.engine
    with Session(engine) as session, session.begin():
        session.add(PickupPoint(**(DEMO_POINTS[1] | {"latitude": 10.0})))
    with pytest.raises(DemoDataConflict, match="different coordinates"):
        seed_demo_points(engine)
    with Session(engine) as session:
        assert session.scalar(select(func.count()).select_from(PickupPoint)) == 3
        assert (
            session.scalar(select(PickupPoint).where(PickupPoint.name == DEMO_POINTS[0]["name"]))
            is None
        )


def test_duplicate_names_are_not_silently_selected(client):
    engine = client.app.state.engine
    with Session(engine) as session, session.begin():
        session.add_all([PickupPoint(**DEMO_POINTS[0]), PickupPoint(**DEMO_POINTS[0])])
    with pytest.raises(DemoDataConflict, match="Duplicate"):
        seed_demo_points(engine)


def test_cli_requires_confirmation():
    with pytest.raises(SystemExit) as result:
        main([])
    assert result.value.code == 2


def test_cli_outputs_usable_ride(client, capsys):
    main(["--confirm-demo"])
    result = json.loads(capsys.readouterr().out)
    assert result["pickup_points"][0]["city"] == "DemoCity"
    RideCreate.model_validate(result["example_ride"])


def test_demo_to_authenticated_ride_flow(client, authenticated):
    demo = seed_demo_points(client.app.state.engine)
    points = client.get("/v1/pickup-points", params={"city": "DemoCity"})
    assert points.status_code == 200
    assert points.json() == demo["pickup_points"]
    headers = authenticated()
    created = client.post("/v1/rides", json=demo["example_ride"], headers=headers)
    assert created.status_code == 201
    assert client.get("/v1/rides/mine", headers=headers).json() == [created.json()]
    search = client.get(
        "/v1/rides",
        headers=headers,
        params={
            "origin_id": demo["example_ride"]["origin_id"],
            "destination_id": demo["example_ride"]["destination_id"],
            "after": datetime.now(UTC).isoformat(),
            "before": (
                RideCreate.model_validate(demo["example_ride"]).departure_at.replace(microsecond=0)
                + timedelta(hours=1)
            ).isoformat(),
        },
    )
    assert search.status_code == 200
    assert search.json() == [created.json()]
