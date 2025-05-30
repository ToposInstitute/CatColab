use sqlx::{PgConnection, Postgres};
use sqlx_migrator::Migration;
use sqlx_migrator::Operation;
use sqlx_migrator::error::Error;
use sqlx_migrator::vec_box;

pub(crate) struct UpdateCollationVersion;
#[async_trait::async_trait]
impl Migration<Postgres> for UpdateCollationVersion {
    fn app(&self) -> &str {
        "backend"
    }
    fn name(&self) -> &str {
        "20250530144904_update_collation_version"
    }
    fn parents(&self) -> Vec<Box<dyn Migration<Postgres>>> {
        vec![]
    }
    fn operations(&self) -> Vec<Box<dyn Operation<Postgres>>> {
        vec_box![MigrationOperation]
    }

    // This up migration is not able to be run inside a transaction, but I'm fairly certain that if
    // the queries fail no functionality is lost and no state needs to be rolled back.
    fn is_atomic(&self) -> bool {
        false
    }
}

struct MigrationOperation;
#[async_trait::async_trait]
impl Operation<Postgres> for MigrationOperation {
    async fn up(&self, conn: &mut PgConnection) -> Result<(), Error> {
        sqlx::query(
            "
            REINDEX DATABASE catcolab;
            ",
        )
        .execute(&mut *conn)
        .await?;

        sqlx::query(
            "
            ALTER DATABASE catcolab REFRESH COLLATION VERSION;
            ",
        )
        .execute(&mut *conn)
        .await?;
        Ok(())
    }

    async fn down(&self, _: &mut PgConnection) -> Result<(), Error> {
        Ok(())
    }
}
