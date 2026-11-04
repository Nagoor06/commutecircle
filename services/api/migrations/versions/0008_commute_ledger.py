"""Private commute preferences and transactional sandbox payment journal."""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("journeys", sa.Column("preferences", sa.JSON(), nullable=True))
    op.create_table(
        "commute_preferences",
        sa.Column("issuer", sa.String(512), primary_key=True),
        sa.Column("subject", sa.String(255), primary_key=True),
        sa.Column("pickup", sa.JSON(), nullable=False),
        sa.Column("workplace", sa.JSON(), nullable=False),
        sa.Column("employer", sa.String(80), nullable=False),
    )
    op.create_table(
        "payment_entries",
        sa.Column(
            "ticket_id", sa.String(36), sa.ForeignKey("journey_tickets.id"), primary_key=True
        ),
        sa.Column("kind", sa.String(24), primary_key=True),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount > 0", name="positive_payment_entry"),
    )
    # Preserve existing sandbox balances when introducing the ledger.
    op.execute(
        "INSERT INTO payment_entries (ticket_id, kind, amount, created_at) "
        "SELECT id, 'charge', charged, CURRENT_TIMESTAMP FROM journey_tickets WHERE charged > 0"
    )
    op.execute(
        "INSERT INTO payment_entries (ticket_id, kind, amount, created_at) "
        "SELECT id, 'opening_refund', refund, CURRENT_TIMESTAMP "
        "FROM journey_tickets WHERE refund > 0"
    )
    op.create_table(
        "booking_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("ticket_id", sa.String(36), sa.ForeignKey("journey_tickets.id"), nullable=False),
        sa.Column("sender", sa.String(10), nullable=False),
        sa.Column("text", sa.String(500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_booking_messages_ticket_id", "booking_messages", ["ticket_id"])
    op.create_table(
        "booking_chat_blocks",
        sa.Column(
            "ticket_id", sa.String(36), sa.ForeignKey("journey_tickets.id"), primary_key=True
        ),
        sa.Column("role", sa.String(10), primary_key=True),
    )


def downgrade():
    op.drop_table("booking_chat_blocks")
    op.drop_table("booking_messages")
    op.drop_table("payment_entries")
    op.drop_table("commute_preferences")
    op.drop_column("journeys", "preferences")
