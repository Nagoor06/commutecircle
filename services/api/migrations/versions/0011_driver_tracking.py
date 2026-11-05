"""Explicit driver consent for confirmed passenger live tracking."""

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "trip_shares",
        sa.Column("passengers_allowed", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade():
    op.drop_column("trip_shares", "passengers_allowed")
