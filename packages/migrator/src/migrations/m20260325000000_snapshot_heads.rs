use sqlx::{PgConnection, Postgres};
use sqlx_migrator::Migration;
use sqlx_migrator::Operation;
use sqlx_migrator::error::Error;
use sqlx_migrator::vec_box;

pub(crate) struct SnapshotHeads;

#[async_trait::async_trait]
impl Migration<Postgres> for SnapshotHeads {
    fn app(&self) -> &str {
        "backend"
    }

    fn name(&self) -> &str {
        "m20260325000000_snapshot_heads"
    }

    fn parents(&self) -> Vec<Box<dyn Migration<Postgres>>> {
        vec![]
    }

    fn operations(&self) -> Vec<Box<dyn Operation<Postgres>>> {
        vec_box![MoveDocIdToRefs]
    }
}

struct MoveDocIdToRefs;

#[async_trait::async_trait]
impl Operation<Postgres> for MoveDocIdToRefs {
    async fn up(&self, conn: &mut PgConnection) -> Result<(), Error> {
        sqlx::query("ALTER TABLE snapshots ADD COLUMN heads TEXT[]")
            .execute(&mut *conn)
            .await?;

        sqlx::query("ALTER TABLE refs ADD COLUMN doc_id TEXT")
            .execute(&mut *conn)
            .await?;

        sqlx::query("UPDATE refs SET doc_id = s.doc_id FROM snapshots s WHERE s.id = refs.head")
            .execute(&mut *conn)
            .await?;

        sqlx::query("ALTER TABLE refs ALTER COLUMN doc_id SET NOT NULL")
            .execute(&mut *conn)
            .await?;

        sqlx::query("ALTER TABLE snapshots DROP COLUMN doc_id")
            .execute(&mut *conn)
            .await?;

        Ok(())
    }

    async fn down(&self, conn: &mut PgConnection) -> Result<(), Error> {
        sqlx::query("ALTER TABLE snapshots ADD COLUMN doc_id TEXT")
            .execute(&mut *conn)
            .await?;

        sqlx::query("UPDATE snapshots s SET doc_id = r.doc_id FROM refs r WHERE s.for_ref = r.id")
            .execute(&mut *conn)
            .await?;

        sqlx::query("ALTER TABLE snapshots ALTER COLUMN doc_id SET NOT NULL")
            .execute(&mut *conn)
            .await?;

        sqlx::query("ALTER TABLE refs DROP COLUMN doc_id")
            .execute(&mut *conn)
            .await?;

        sqlx::query("ALTER TABLE snapshots DROP COLUMN heads")
            .execute(&mut *conn)
            .await?;

        Ok(())
    }
}
