"""V2 confidential safety reports and staff case review events."""

import sqlalchemy as sa
from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "safety_reports",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("issuer", sa.String(512), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("journey_id", sa.String(36), sa.ForeignKey("journeys.id"), nullable=False),
        sa.Column("ticket_id", sa.String(36), sa.ForeignKey("journey_tickets.id")),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("description", sa.String(1500), nullable=False),
        sa.Column("state", sa.String(24), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_safety_reports_owner", "safety_reports", ["issuer", "subject", "created_at"])
    op.create_table(
        "safety_case_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("report_id", sa.String(36), sa.ForeignKey("safety_reports.id"), nullable=False),
        sa.Column("reviewer", sa.String(255), nullable=False),
        sa.Column("state", sa.String(24), nullable=False),
        sa.Column("note", sa.String(1000), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_safety_case_events_report", "safety_case_events", ["report_id", "created_at"])


def downgrade():
    op.drop_table("safety_case_events")
    op.drop_table("safety_reports")
