"""Opt-in browser push and transactional message delivery."""

import sqlalchemy as sa
from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("owner", sa.String(64), nullable=False),
        sa.Column("endpoint", sa.String(2048), nullable=False),
        sa.Column("p256dh", sa.String(100), nullable=False),
        sa.Column("auth", sa.String(32), nullable=False),
        sa.Column("binding", sa.String(36), nullable=False),
        sa.Column("updated", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_push_subscriptions_owner", "push_subscriptions", ["owner"])
    op.create_table(
        "message_push_deliveries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "message_id", sa.String(36), sa.ForeignKey("booking_messages.id"), nullable=False
        ),
        sa.Column(
            "subscription_id", sa.String(64), sa.ForeignKey("push_subscriptions.id"), nullable=False
        ),
        sa.Column("binding", sa.String(36), nullable=False),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("attempts", sa.Integer, nullable=False),
        sa.Column("created", sa.DateTime(timezone=True), nullable=False),
        sa.Column("available", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("message_id", "subscription_id", name="uq_message_push_device"),
    )
    op.create_index("ix_message_push_due", "message_push_deliveries", ["state", "available"])


def downgrade():
    op.drop_table("message_push_deliveries")
    op.drop_table("push_subscriptions")
