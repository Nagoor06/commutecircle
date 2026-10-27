"""Create curated public pickup points; no private home addresses."""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "pickup_points",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("city", sa.String(80), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.CheckConstraint("latitude BETWEEN -90 AND 90", name="valid_latitude"),
        sa.CheckConstraint("longitude BETWEEN -180 AND 180", name="valid_longitude"),
    )
    op.create_index("ix_pickup_points_city", "pickup_points", ["city"])


def downgrade():
    op.drop_index("ix_pickup_points_city", table_name="pickup_points")
    op.drop_table("pickup_points")
