"""Add ride offers linked only to public pickup points."""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "rides",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("driver_issuer", sa.String(512), nullable=False),
        sa.Column("driver_subject", sa.String(255), nullable=False),
        sa.Column(
            "origin_id",
            sa.Integer(),
            sa.ForeignKey("pickup_points.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "destination_id",
            sa.Integer(),
            sa.ForeignKey("pickup_points.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("departure_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("seats_available", sa.Integer(), nullable=False),
        sa.CheckConstraint("seats_available BETWEEN 1 AND 8", name="valid_ride_seats"),
        sa.CheckConstraint("origin_id <> destination_id", name="different_ride_points"),
    )
    op.create_index(
        "ix_rides_route_departure", "rides", ["origin_id", "destination_id", "departure_at"]
    )
    op.create_index("ix_rides_owner", "rides", ["driver_issuer", "driver_subject"])


def downgrade():
    op.drop_index("ix_rides_owner", table_name="rides")
    op.drop_index("ix_rides_route_departure", table_name="rides")
    op.drop_table("rides")
