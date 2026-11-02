"""Track whole-ride cancellation separately from passenger cancellation."""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "rides", sa.Column("cancelled", sa.Boolean(), nullable=False, server_default=sa.false())
    )


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM rides WHERE cancelled")):
        raise RuntimeError("Cannot remove cancellation status while cancelled rides exist")
    op.drop_column("rides", "cancelled")
