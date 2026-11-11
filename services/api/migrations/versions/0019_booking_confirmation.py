"""Record checkout independently of fare and close stranded approval requests."""

import sqlalchemy as sa
from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("journey_tickets", sa.Column("confirmed_at", sa.DateTime(timezone=True)))
    op.execute(
        "UPDATE journey_tickets SET confirmed_at = "
        "(SELECT created_at FROM payment_entries "
        "WHERE ticket_id = journey_tickets.id AND kind = 'charge') WHERE charged > 0"
    )
    op.execute(
        "UPDATE journey_tickets SET state = 'driver_cancelled' "
        "WHERE state = 'requested' AND journey_id IN "
        "(SELECT id FROM journeys WHERE cancelled IS TRUE)"
    )


def downgrade():
    op.drop_column("journey_tickets", "confirmed_at")
