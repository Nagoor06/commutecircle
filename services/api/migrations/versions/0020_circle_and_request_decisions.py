"""Record invitation revocation and distinguish declined requests from cancellations."""

import sqlalchemy as sa
from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("circle_invitations", sa.Column("revoked_at", sa.DateTime(timezone=True)))
    op.add_column("journey_tickets", sa.Column("declined_at", sa.DateTime(timezone=True)))


def downgrade():
    op.drop_column("journey_tickets", "declined_at")
    op.drop_column("circle_invitations", "revoked_at")
