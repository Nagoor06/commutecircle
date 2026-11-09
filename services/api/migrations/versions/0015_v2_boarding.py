"""V2 boarding challenges and auditable trip transitions."""

import sqlalchemy as sa
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("journey_tickets", sa.Column("travel_state", sa.String(24)))
    op.add_column("journey_tickets", sa.Column("boarded_at", sa.DateTime(timezone=True)))
    op.add_column("journey_tickets", sa.Column("completed_at", sa.DateTime(timezone=True)))
    op.create_table(
        "boarding_challenges",
        sa.Column("ticket_id", sa.String(36), sa.ForeignKey("journey_tickets.id"), primary_key=True),
        sa.Column("salt", sa.String(64), nullable=False),
        sa.Column("digest", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
    )
    op.create_table(
        "trip_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("journey_id", sa.String(36), sa.ForeignKey("journeys.id"), nullable=False),
        sa.Column("ticket_id", sa.String(36), sa.ForeignKey("journey_tickets.id")),
        sa.Column("issuer", sa.String(512), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_trip_events_journey", "trip_events", ["journey_id", "created_at"])


def downgrade():
    op.drop_table("trip_events")
    op.drop_table("boarding_challenges")
    for key in ("completed_at", "boarded_at", "travel_state"):
        op.drop_column("journey_tickets", key)
