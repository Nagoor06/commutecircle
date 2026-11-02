"""Add priced journeys and sandbox checkout receipts."""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "journeys",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("issuer", sa.String(512), nullable=False),
        sa.Column("driver", sa.String(255), nullable=False),
        sa.Column("departure", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_stop_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("stops", sa.JSON(), nullable=False),
        sa.Column("price_paise", sa.Integer(), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("cancelled", sa.Boolean(), nullable=False),
    )
    op.create_index("ix_journeys_last_stop_at", "journeys", ["last_stop_at"])
    op.create_table(
        "journey_tickets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("journey_id", sa.String(36), sa.ForeignKey("journeys.id"), nullable=False),
        sa.Column("issuer", sa.String(512), nullable=False),
        sa.Column("rider", sa.String(255), nullable=False),
        sa.Column("board", sa.Integer(), nullable=False),
        sa.Column("alight", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(24), nullable=False),
        sa.Column("expires", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fare", sa.Integer(), nullable=False),
        sa.Column("charged", sa.Integer(), nullable=False),
        sa.Column("refund", sa.Integer(), nullable=False),
        sa.CheckConstraint("board >= 0 AND board < alight", name="ordered_ticket_stops"),
        sa.CheckConstraint(
            "refund >= 0 AND refund <= charged AND charged <= fare", name="ticket_amounts"
        ),
    )
    op.create_index("ix_journey_tickets_journey_id", "journey_tickets", ["journey_id"])


def downgrade():
    op.drop_table("journey_tickets")
    op.drop_table("journeys")
