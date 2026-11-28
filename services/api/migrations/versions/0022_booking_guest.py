"""A private traveller label on tickets managed by another account."""

import sqlalchemy as sa
from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("journey_tickets", sa.Column("guest_name", sa.String(60), nullable=True))


def downgrade():
    op.drop_column("journey_tickets", "guest_name")
