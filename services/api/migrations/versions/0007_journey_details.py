"""Optional vehicle and passenger reviews for priced journeys."""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("journeys", sa.Column("vehicle", sa.JSON(), nullable=True))
    with op.batch_alter_table("journey_tickets") as batch:
        batch.add_column(sa.Column("stars", sa.Integer(), nullable=True))
        batch.create_check_constraint("journey_review_stars", "stars BETWEEN 1 AND 5")


def downgrade():
    with op.batch_alter_table("journey_tickets") as batch:
        batch.drop_constraint("journey_review_stars", type_="check")
        batch.drop_column("stars")
    op.drop_column("journeys", "vehicle")
