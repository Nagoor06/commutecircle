"""V2 profiles, manual driver verification and approved vehicles."""

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "commuter_profiles",
        sa.Column("issuer", sa.String(512), primary_key=True),
        sa.Column("subject", sa.String(255), primary_key=True),
        sa.Column("display_name", sa.String(80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "driver_verifications",
        sa.Column("issuer", sa.String(512), primary_key=True),
        sa.Column("subject", sa.String(255), primary_key=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("evidence_reference", sa.String(128)),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("reviewer", sa.String(255)),
        sa.CheckConstraint(
            "status IN ('pending','approved','rejected','suspended')",
            name="valid_driver_verification",
        ),
    )
    op.create_table(
        "verified_vehicles",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("issuer", sa.String(512), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("make", sa.String(60), nullable=False),
        sa.Column("model", sa.String(60), nullable=False),
        sa.Column("color", sa.String(40), nullable=False),
        sa.Column("registration", sa.String(24), nullable=False),
        sa.Column("seat_capacity", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("reviewer", sa.String(255)),
        sa.CheckConstraint(
            "status IN ('pending','approved','rejected','suspended')",
            name="valid_vehicle_verification",
        ),
        sa.CheckConstraint("seat_capacity BETWEEN 1 AND 8", name="valid_vehicle_capacity"),
    )
    op.create_index("ix_verified_vehicles_owner", "verified_vehicles", ["issuer", "subject"])
    with op.batch_alter_table("journeys") as batch:
        batch.add_column(
            sa.Column(
                "vehicle_registration_id", sa.String(36), sa.ForeignKey("verified_vehicles.id")
            )
        )


def downgrade():
    with op.batch_alter_table("journeys") as batch:
        batch.drop_column("vehicle_registration_id")
    op.drop_table("verified_vehicles")
    op.drop_table("driver_verifications")
    op.drop_table("commuter_profiles")
