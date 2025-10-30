use sqlx::{PgConnection, Postgres};
use sqlx_migrator::Operation;
use sqlx_migrator::error::Error;
use sqlx_migrator::migration;
use sqlx_migrator::vec_box;

pub(crate) struct AddRefsDeletedAt;

migration!(
    Postgres,
    AddRefsDeletedAt,
    "backend",
    "20250924133640_add_refs_deleted_at",
    vec_box![],
    vec_box![MigrationOperation]
);

struct MigrationOperation;
#[async_trait::async_trait]
impl Operation<Postgres> for MigrationOperation {
    async fn up(&self, conn: &mut PgConnection) -> Result<(), Error> {
        sqlx::query(
            "
            ALTER TABLE refs
            ADD COLUMN deleted_at TIMESTAMPTZ NULL;
            ",
        )
        .execute(conn)
        .await?;

        Ok(())
    }

    async fn down(&self, conn: &mut PgConnection) -> Result<(), Error> {
        sqlx::query(
            "
            ALTER TABLE refs
            DROP COLUMN deleted_at;
            ",
        )
        .execute(conn)
        .await?;

        Ok(())
    }
}
