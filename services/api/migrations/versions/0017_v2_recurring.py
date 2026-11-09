"""V2 scheduled journey templates and one-off exceptions."""

import sqlalchemy as sa
from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "recurring_rides",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("issuer", sa.String(512), nullable=False),
        sa.Column("driver", sa.String(255), nullable=False),
        sa.Column("stops", sa.JSON(), nullable=False),
        sa.Column("local_time", sa.String(5), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("weekdays", sa.JSON(), nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.Column("price_paise", sa.Integer(), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("vehicle_id", sa.String(36), sa.ForeignKey("verified_vehicles.id")),
        sa.Column("booking_mode", sa.String(16), nullable=False),
        sa.Column("circle_id", sa.String(36)),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_recurring_rides_driver", "recurring_rides", ["issuer", "driver"])
    op.create_table(
        "recurring_exceptions",
        sa.Column(
            "template_id", sa.String(36), sa.ForeignKey("recurring_rides.id"), primary_key=True
        ),
        sa.Column("service_date", sa.Date(), primary_key=True),
        sa.Column("reason", sa.String(120), nullable=False),
    )
    with op.batch_alter_table("journeys") as batch:
        batch.add_column(
            sa.Column("recurring_template_id", sa.String(36), sa.ForeignKey("recurring_rides.id"))
        )
        batch.add_column(sa.Column("recurring_date", sa.Date()))
        batch.create_unique_constraint(
            "uq_recurring_occurrence", ["recurring_template_id", "recurring_date"]
        )


def downgrade():
    with op.batch_alter_table("journeys") as batch:
        batch.drop_constraint("uq_recurring_occurrence", type_="unique")
        batch.drop_column("recurring_date")
        batch.drop_column("recurring_template_id")
    op.drop_table("recurring_exceptions")
    op.drop_table("recurring_rides")
