import os

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import delete, text
from sqlalchemy.orm import Session

from app.main import create_app
from app.models import (
    BoardingChallenge,
    Booking,
    ChatBlock,
    ChatRead,
    CircleInvitation,
    CircleMember,
    Commute,
    CommuteCircle,
    CommuterProfile,
    DriverVerification,
    Journey,
    Message,
    Notification,
    NotificationPreference,
    PaymentEntry,
    PickupPoint,
    RecurringException,
    RecurringRide,
    Ride,
    SafetyCaseEvent,
    SafetyReport,
    Ticket,
    TripEvent,
    TripShare,
    TrustedContact,
    VerificationLimit,
    VerifiedVehicle,
)

@pytest.fixture
def client(tmp_path, monkeypatch):
    url = os.getenv("TEST_DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setenv("DATABASE_URL", url)
    command.upgrade(Config("alembic.ini"), "head")
    app = create_app(url)
    with Session(app.state.engine) as session:
        # The integration database is reused between tests; clear V2 dependents
        # before V1 journeys so tests cannot inherit previously verified users.
        session.execute(delete(SafetyCaseEvent))
        session.execute(delete(SafetyReport))
        session.execute(delete(BoardingChallenge))
        session.execute(delete(TripEvent))
        session.execute(delete(RecurringException))
        session.execute(delete(CircleInvitation))
        session.execute(delete(CircleMember))
        session.execute(delete(Notification))
        session.execute(delete(NotificationPreference))
        session.execute(delete(VerificationLimit))
        session.execute(delete(TripShare))
        session.execute(delete(TrustedContact))
        session.execute(delete(Message))
        session.execute(delete(ChatRead))
        session.execute(delete(ChatBlock))
        session.execute(delete(PaymentEntry))
        session.execute(delete(Commute))
        session.execute(delete(Ticket))
        session.execute(delete(Journey))
        session.execute(delete(RecurringRide))
        session.execute(delete(CommuteCircle))
        session.execute(delete(VerifiedVehicle))
        session.execute(delete(DriverVerification))
        session.execute(delete(CommuterProfile))
        session.execute(delete(Booking))
        session.execute(delete(Ride))
        session.execute(delete(PickupPoint))
        session.add_all(
            [
                PickupPoint(
                    id=1, name="Public point A", city="TestCity", latitude=12.0, longitude=77.0
                ),
                PickupPoint(
                    id=2, name="Public point B", city="OtherCity", latitude=13.0, longitude=78.0
                ),
            ]
        )
        session.flush()
        if app.state.engine.dialect.name == "postgresql":
            # Fixture IDs are explicit; keep generated IDs above them for seed tests.
            session.execute(
                text("SELECT setval(pg_get_serial_sequence('pickup_points', 'id'), 2, true)")
            )
        session.commit()
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def clear_oidc_environment(monkeypatch):
    monkeypatch.setenv("NOTIFICATION_WORKER_ENABLED", "false")
    for name in ("OIDC_ISSUER", "OIDC_AUDIENCE", "OIDC_JWKS_URL", "DOCS_OAUTH_CLIENT_ID"):
        monkeypatch.delenv(name, raising=False)


@pytest.fixture(scope="session")
def signing_key():
    from cryptography.hazmat.primitives.asymmetric import rsa

    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture
def authenticated(client, signing_key):
    from datetime import UTC, datetime, timedelta
    from types import SimpleNamespace
    from unittest.mock import Mock

    import jwt

    from app.auth.tokens import TokenVerifier
    from app.core.config import Settings

    verifier = TokenVerifier(
        Settings(
            "unused",
            "https://identity.example",
            "commutecircle-api",
            "https://identity.example/jwks",
        )
    )
    verifier.jwks = Mock()
    verifier.jwks.get_signing_key_from_jwt.return_value = SimpleNamespace(
        key=signing_key.public_key()
    )
    client.app.state.token_verifier = verifier

    def headers(subject="driver-a", scope="rides:read rides:write", **overrides):
        now = datetime.now(UTC)
        claims = {
            "iss": "https://identity.example",
            "aud": "commutecircle-api",
            "sub": subject,
            "iat": now,
            "exp": now + timedelta(minutes=5),
            "scope": scope,
        }
        claims.update(overrides)
        token = jwt.encode(claims, signing_key, algorithm="RS256", headers={"kid": "test-key"})
        return {"Authorization": f"Bearer {token}"}

    return headers


@pytest.fixture
def offered_ride(client, authenticated):
    from datetime import UTC, datetime, timedelta

    response = client.post(
        "/v1/rides",
        headers=authenticated(),
        json={
            "origin_id": 1,
            "destination_id": 2,
            "departure_at": (datetime.now(UTC) + timedelta(hours=2)).isoformat(),
            "seats_available": 1,
        },
    )
    assert response.status_code == 201
    return response.json()["id"]
