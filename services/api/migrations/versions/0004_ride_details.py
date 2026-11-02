"""Store optional vehicle snapshots and one rating per booking."""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("rides", sa.Column("vehicle", sa.JSON(), nullable=True))
    with op.batch_alter_table("bookings") as batch:
        batch.add_column(sa.Column("stars", sa.Integer(), nullable=True))
        batch.create_check_constraint("valid_review_stars", "stars BETWEEN 1 AND 5")


def downgrade():
    with op.batch_alter_table("bookings") as batch:
        batch.drop_constraint("valid_review_stars", type_="check")
        batch.drop_column("stars")
    op.drop_column("rides", "vehicle")
