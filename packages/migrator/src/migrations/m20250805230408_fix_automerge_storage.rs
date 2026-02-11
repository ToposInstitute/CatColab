use sqlx::{PgConnection, Postgres};
use sqlx_migrator::Migration;
use sqlx_migrator::Operation;
use sqlx_migrator::error::Error;
use sqlx_migrator::vec_box;

// See migration 20250516154702_automerge_storage
// This migration re-ran the data migration script from the previous migration to fix errors in the
// original script.
pub(crate) struct FixAutomergeStorage;
#[async_trait::async_trait]
impl Migration<Postgres> for FixAutomergeStorage {
    fn app(&self) -> &str {
        "backend"
    }
    fn name(&self) -> &str {
        "20250805230408_fix_automerge_storage"
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
    async fn up(&self, _: &mut PgConnection) -> Result<(), Error> {
        Ok(())
    }

    async fn down(&self, _: &mut PgConnection) -> Result<(), Error> {
        Ok(())
    }
}
