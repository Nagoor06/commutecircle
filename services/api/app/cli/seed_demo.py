"""Explicit, repeatable local demo setup: python -m app.cli.seed_demo --confirm-demo."""

import argparse
import json
from datetime import UTC, datetime, timedelta

from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.data.demo_pickup_points import DEMO_POINTS
from app.db.session import build_engine
from app.models import PickupPoint


class DemoDataConflict(Exception):
    """Existing data cannot safely be treated as this demo fixture."""


def seed_demo_points(engine: Engine) -> dict:
    points = []
    with Session(engine) as session, session.begin():
        for data in DEMO_POINTS:
            matches = list(
                session.scalars(
                    select(PickupPoint).where(
                        PickupPoint.city == data["city"], PickupPoint.name == data["name"]
                    )
                )
            )
            if len(matches) > 1:
                raise DemoDataConflict("Duplicate demo names found; no changes committed")
            if matches:
                point = matches[0]
                if point.latitude != data["latitude"] or point.longitude != data["longitude"]:
                    raise DemoDataConflict(
                        "Demo name has different coordinates; no changes committed"
                    )
            else:
                point = PickupPoint(**data)
                session.add(point)
                session.flush()
            points.append({"id": point.id, **data})
    return {
        "notice": "Synthetic local test points only. Not real pickup locations.",
        "pickup_points": points,
        "example_ride": {
            "origin_id": points[0]["id"],
            "destination_id": points[1]["id"],
            "departure_at": (datetime.now(UTC) + timedelta(hours=2)).isoformat(),
            "seats_available": 3,
        },
    }


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Load synthetic local demo pickup points")
    parser.add_argument(
        "--confirm-demo", action="store_true", help="Confirm this is a demo database"
    )
    args = parser.parse_args(argv)
    if not args.confirm_demo:
        parser.error("Use --confirm-demo only against your local test database")
    engine = build_engine(Settings.from_environment().database_url)
    try:
        result = seed_demo_points(engine)
        print(json.dumps(result, indent=2))
    except DemoDataConflict as exc:
        parser.exit(1, f"{exc}\n")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
