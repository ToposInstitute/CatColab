use sqlx::{Acquire, PgConnection, Postgres};
use sqlx_migrator::Operation;
use sqlx_migrator::error::Error;
use sqlx_migrator::migration;
use sqlx_migrator::vec_box;

pub(crate) struct DocumentRefs;

migration!(
    Postgres,
    DocumentRefs,
    "backend",
    "20241004010448_document_refs",
    vec_box![],
    vec_box![MigrationOperation]
);

struct MigrationOperation;
#[async_trait::async_trait]
impl Operation<Postgres> for MigrationOperation {
    async fn up(&self, conn: &mut PgConnection) -> Result<(), Error> {
        let mut tx = conn.begin().await?;

        sqlx::query(
            "
            CREATE TABLE snapshots (
                id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
                for_ref UUID NOT NULL,
                content JSONB NOT NULL,
                last_updated TIMESTAMPTZ NOT NULL
            );
            ",
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "
            CREATE TABLE refs (
                id UUID PRIMARY KEY,
                head INT NOT NULL REFERENCES snapshots (id),
                created TIMESTAMPTZ NOT NULL
            );
            ",
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "
            ALTER TABLE snapshots
                ADD FOREIGN KEY (for_ref) REFERENCES refs (id) DEFERRABLE INITIALLY DEFERRED;
            ",
        )
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(())
    }

    async fn down(&self, conn: &mut PgConnection) -> Result<(), Error> {
        sqlx::query("DROP TABLE refs, snapshots").execute(conn).await?;
        Ok(())
    }
}
