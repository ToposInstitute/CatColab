use sqlx::{PgConnection, Postgres};
use sqlx_migrator::Operation;
use sqlx_migrator::error::Error;
use sqlx_migrator::migration;
use sqlx_migrator::vec_box;

pub(crate) struct AddSettingsLlmEnabled;

migration!(
    Postgres,
    AddSettingsLlmEnabled,
    "backend",
    "20260804000000_add_settings_llm_enabled",
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
            ADD COLUMN settings_llm_enabled BOOLEAN NOT NULL DEFAULT FALSE;
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
            DROP COLUMN settings_llm_enabled;
            ",
        )
        .execute(conn)
        .await?;

        Ok(())
    }
}
