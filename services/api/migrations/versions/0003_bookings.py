"""Add booking state and seat capacity while preserving existing rides."""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("rides", sa.Column("seats_capacity", sa.Integer(), nullable=True))
    op.execute("UPDATE rides SET seats_capacity = seats_available")
    with op.batch_alter_table("rides") as batch:
        batch.alter_column("seats_capacity", existing_type=sa.Integer(), nullable=False)
        batch.drop_constraint("valid_ride_seats", type_="check")
        batch.create_check_constraint("valid_ride_seats", "seats_available BETWEEN 0 AND 8")
        batch.create_check_constraint(
            "valid_ride_capacity",
            "seats_capacity BETWEEN 1 AND 8 AND seats_available <= seats_capacity",
        )
    op.create_table(
        "bookings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "ride_id", sa.String(36), sa.ForeignKey("rides.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("rider_issuer", sa.String(512), nullable=False),
        sa.Column("rider_subject", sa.String(255), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "ride_id", "rider_issuer", "rider_subject", name="uq_booking_rider_ride"
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'accepted', 'rejected', 'cancelled')",
            name="valid_booking_status",
        ),
    )
    op.create_index("ix_bookings_rider", "bookings", ["rider_issuer", "rider_subject"])


def downgrade():
    # Downgrade cannot represent sold-out rides; refuse before deleting any data.
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM rides WHERE seats_available = 0")):
        raise RuntimeError(
            "Cannot downgrade while sold-out rides exist; retain schema and use a forward fix"
        )
    op.drop_index("ix_bookings_rider", table_name="bookings")
    op.drop_table("bookings")
    with op.batch_alter_table("rides") as batch:
        batch.drop_constraint("valid_ride_capacity", type_="check")
        batch.drop_constraint("valid_ride_seats", type_="check")
        batch.create_check_constraint("valid_ride_seats", "seats_available BETWEEN 1 AND 8")
        batch.drop_column("seats_capacity")
