use sqlx::{PgConnection, Postgres};
use sqlx_migrator::Migration;
use sqlx_migrator::Operation;
use sqlx_migrator::error::Error;
use sqlx_migrator::vec_box;

pub(crate) struct AddPermissionsObjectSubjectIdx;
#[async_trait::async_trait]
impl Migration<Postgres> for AddPermissionsObjectSubjectIdx {
    fn app(&self) -> &str {
        "backend"
    }
    fn name(&self) -> &str {
        "20250409171833_add_permissions_object_subject_idx"
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

struct MigrationOperation;
#[async_trait::async_trait]
impl Operation<Postgres> for MigrationOperation {
    async fn up(&self, conn: &mut PgConnection) -> Result<(), Error> {
        sqlx::query!(
            "
            CREATE INDEX CONCURRENTLY IF NOT EXISTS permissions_object_subject_idx
                ON permissions (object, subject);
            "
        )
        .execute(conn)
        .await?;

        Ok(())
    }

    async fn down(&self, conn: &mut PgConnection) -> Result<(), Error> {
        sqlx::query!(
            "
            DROP INDEX CONCURRENTLY IF EXISTS permissions_object_subject_idx;
            "
        )
        .execute(conn)
        .await?;
        Ok(())
    }
}
