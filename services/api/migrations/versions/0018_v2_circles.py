"""V2 invitation-only circles and private journey visibility."""

import sqlalchemy as sa
from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "commute_circles",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("issuer", sa.String(512), nullable=False),
        sa.Column("owner", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "circle_members",
        sa.Column(
            "circle_id", sa.String(36), sa.ForeignKey("commute_circles.id"), primary_key=True
        ),
        sa.Column("issuer", sa.String(512), primary_key=True),
        sa.Column("subject", sa.String(255), primary_key=True),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_circle_members_owner", "circle_members", ["issuer", "subject"])
    op.create_table(
        "circle_invitations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("circle_id", sa.String(36), sa.ForeignKey("commute_circles.id"), nullable=False),
        sa.Column("token_digest", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_circle_invitations_circle", "circle_invitations", ["circle_id"])
    with op.batch_alter_table("journeys") as batch:
        batch.add_column(
            sa.Column(
                "circle_id",
                sa.String(36),
                sa.ForeignKey("commute_circles.id", name="fk_journeys_v2_circle"),
            )
        )
        batch.create_index("ix_journeys_circle_id", ["circle_id"])


def downgrade():
    with op.batch_alter_table("journeys") as batch:
        batch.drop_index("ix_journeys_circle_id")
        batch.drop_constraint("fk_journeys_v2_circle", type_="foreignkey")
        batch.drop_column("circle_id")
    op.drop_table("circle_invitations")
    op.drop_table("circle_members")
    op.drop_table("commute_circles")
