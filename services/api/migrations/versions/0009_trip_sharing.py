"""Private favourite contacts and expiring live-location links."""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "trusted_contacts",
        sa.Column("issuer", sa.String(512), primary_key=True),
        sa.Column("subject", sa.String(255), primary_key=True),
        sa.Column("slot", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("channel", sa.String(10), nullable=False),
        sa.Column("destination", sa.String(160), nullable=False),
        sa.CheckConstraint("slot BETWEEN 1 AND 5", name="trusted_contact_slot"),
    )
    op.create_table(
        "trip_shares",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("issuer", sa.String(512), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("journey_id", sa.String(36), sa.ForeignKey("journeys.id"), nullable=False),
        sa.Column("ticket_id", sa.String(36), sa.ForeignKey("journey_tickets.id")),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False),
        sa.Column("latitude", sa.Float()),
        sa.Column("longitude", sa.Float()),
        sa.Column("accuracy_m", sa.Float()),
        sa.Column("observed_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.Column("sequence", sa.Integer(), nullable=False),
    )
    op.create_index("ix_trip_shares_journey_id", "trip_shares", ["journey_id"])


def downgrade():
    op.drop_table("trip_shares")
    op.drop_table("trusted_contacts")
