"""V2 journey request/consent fields; legacy journeys remain instant."""

import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "journeys",
        sa.Column("booking_mode", sa.String(16), nullable=False, server_default="instant"),
    )
    op.add_column("journey_tickets", sa.Column("requested_at", sa.DateTime(timezone=True)))
    op.add_column("journey_tickets", sa.Column("consent_at", sa.DateTime(timezone=True)))
    op.add_column("journey_tickets", sa.Column("consent_version", sa.String(24)))
    op.add_column("journey_tickets", sa.Column("consent_fare_paise", sa.Integer()))
    op.add_column("journey_tickets", sa.Column("consent_pickup_at", sa.DateTime(timezone=True)))
    op.create_index("ix_journey_tickets_state", "journey_tickets", ["state"])


def downgrade():
    op.drop_index("ix_journey_tickets_state", "journey_tickets")
    for key in (
        "consent_pickup_at",
        "consent_fare_paise",
        "consent_version",
        "consent_at",
        "requested_at",
    ):
        op.drop_column("journey_tickets", key)
    op.drop_column("journeys", "booking_mode")
