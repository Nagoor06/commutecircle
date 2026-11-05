"""Private conversation inbox and monotonic read cursors."""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "booking_chat_reads",
        sa.Column(
            "ticket_id", sa.String(36), sa.ForeignKey("journey_tickets.id"), primary_key=True
        ),
        sa.Column("role", sa.String(10), primary_key=True),
        sa.Column("message_id", sa.String(36), nullable=False),
        sa.Column("seen_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_booking_messages_thread_order", "booking_messages", ["ticket_id", "created_at", "id"]
    )


def downgrade():
    op.drop_index("ix_booking_messages_thread_order", table_name="booking_messages")
    op.drop_table("booking_chat_reads")
