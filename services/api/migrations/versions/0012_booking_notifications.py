"""Private notification preferences, verification budgets and transactional outbox."""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "notification_preferences",
        sa.Column("owner", sa.String(64), primary_key=True),
        sa.Column("email", sa.String(254)),
        sa.Column("email_enabled", sa.Boolean(), nullable=False),
        sa.Column("phone", sa.String(16)),
        sa.Column("phone_channel", sa.String(12), nullable=False),
        sa.Column("consent_at", sa.DateTime(timezone=True)),
        sa.Column("pending_phone", sa.String(16)),
        sa.Column("challenge", sa.String(36)),
        sa.Column("verification_sid", sa.String(34)),
        sa.Column("verification_expires", sa.DateTime(timezone=True)),
        sa.Column("verification_attempts", sa.Integer(), nullable=False),
    )
    op.create_table(
        "notification_verification_limits",
        sa.Column("key", sa.String(80), primary_key=True),
        sa.Column("window", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last", sa.DateTime(timezone=True), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
    )
    op.create_table(
        "booking_notifications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("ticket_id", sa.String(36), sa.ForeignKey("journey_tickets.id"), nullable=False),
        sa.Column("owner", sa.String(64), nullable=False),
        sa.Column("event", sa.String(24), nullable=False),
        sa.Column("channel", sa.String(12), nullable=False),
        sa.Column("recipient", sa.String(254), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("state", sa.String(20), nullable=False),
        sa.Column("created", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated", sa.DateTime(timezone=True), nullable=False),
        sa.Column("available", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("provider_id", sa.String(100)),
        sa.UniqueConstraint("ticket_id", "event", "channel", name="one_booking_alert"),
    )
    for column in ("ticket_id", "owner", "state", "available"):
        op.create_index("ix_booking_notifications_" + column, "booking_notifications", [column])


def downgrade():
    op.drop_table("booking_notifications")
    op.drop_table("notification_verification_limits")
    op.drop_table("notification_preferences")
