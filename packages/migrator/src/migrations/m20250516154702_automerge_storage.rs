use sqlx::{Acquire, PgConnection, Postgres};
use sqlx_migrator::Migration;
use sqlx_migrator::Operation;
use sqlx_migrator::error::Error;
use sqlx_migrator::vec_box;

pub(crate) struct AutomergeStorage;
#[async_trait::async_trait]
impl Migration<Postgres> for AutomergeStorage {
    fn app(&self) -> &str {
        "backend"
    }
    fn name(&self) -> &str {
        "20250516154702_automerge_storage"
    }
    fn parents(&self) -> Vec<Box<dyn Migration<Postgres>>> {
        vec![]
    }
    fn operations(&self) -> Vec<Box<dyn Operation<Postgres>>> {
        vec_box![MigrationOperation]
    }

    fn is_atomic(&self) -> bool {
        false
    }
}

// This migration relied on runnning an external script from the deleted automerge-doc-server package
// to populate the new doc_id column. All in-use databases had been migrated at the time the script was
// removed, allowing the data migration script to be safely removed. This migration now only handles
// schema creation for new databases.
struct MigrationOperation;
#[async_trait::async_trait]
impl Operation<Postgres> for MigrationOperation {
    async fn up(&self, conn: &mut PgConnection) -> Result<(), Error> {
        let mut tx = conn.begin().await?;

        sqlx::query(
            "
            CREATE TABLE storage (
                key text[] PRIMARY KEY,
                data bytea NOT NULL
            );
            ",
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "
            ALTER TABLE snapshots ADD COLUMN doc_id TEXT;
            ",
        )
        .execute(&mut *tx)
        .await?;

        // The script populating doc_id was run here

        sqlx::query(
            "
            ALTER TABLE snapshots ALTER COLUMN doc_id SET NOT NULL;
            ",
        )
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(())
    }

    async fn down(&self, conn: &mut PgConnection) -> Result<(), Error> {
        let mut tx = conn.begin().await?;

        sqlx::query(
            "
            DROP TABLE IF EXISTS storage;
            ",
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "
            ALTER TABLE snapshots DROP COLUMN IF EXISTS doc_id;
            ",
        )
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(())
    }
}
