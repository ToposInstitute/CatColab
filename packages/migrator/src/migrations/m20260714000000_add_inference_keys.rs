use sqlx::{PgConnection, Postgres};
use sqlx_migrator::Operation;
use sqlx_migrator::error::Error;
use sqlx_migrator::migration;
use sqlx_migrator::vec_box;

pub(crate) struct AddInferenceKeys;

migration!(
    Postgres,
    AddInferenceKeys,
    "backend",
    "20260714000000_add_inference_keys",
    vec_box![],
    vec_box![MigrationOperation]
);

struct MigrationOperation;
#[async_trait::async_trait]
impl Operation<Postgres> for MigrationOperation {
    async fn up(&self, conn: &mut PgConnection) -> Result<(), Error> {
        sqlx::query(
            "
            ALTER TABLE users
            ADD COLUMN inference_key TEXT NULL,
            ADD COLUMN inference_hash TEXT NULL;
            ",
        )
        .execute(conn)
        .await?;

        Ok(())
    }

    async fn down(&self, conn: &mut PgConnection) -> Result<(), Error> {
        sqlx::query(
            "
            ALTER TABLE users
            DROP COLUMN inference_key,
            DROP COLUMN inference_hash;
            ",
        )
        .execute(conn)
        .await?;

        Ok(())
    }
}
