use sqlx::{PgConnection, Postgres};
use sqlx_migrator::Migration;
use sqlx_migrator::Operation;
use sqlx_migrator::error::Error;
use sqlx_migrator::vec_box;

pub(crate) struct AddUserStateDocId;

#[async_trait::async_trait]
impl Migration<Postgres> for AddUserStateDocId {
    fn app(&self) -> &str {
        "backend"
    }

    fn name(&self) -> &str {
        "m20260320000000_add_user_state_doc_id"
    }

    fn parents(&self) -> Vec<Box<dyn Migration<Postgres>>> {
        vec![]
    }

    fn operations(&self) -> Vec<Box<dyn Operation<Postgres>>> {
        vec_box![AddStateDocIdColumn]
    }
}

struct AddStateDocIdColumn;

#[async_trait::async_trait]
impl Operation<Postgres> for AddStateDocIdColumn {
    async fn up(&self, conn: &mut PgConnection) -> Result<(), Error> {
        sqlx::query(
            r#"
            ALTER TABLE users ADD COLUMN IF NOT EXISTS state_doc_id TEXT UNIQUE;
            "#,
        )
        .execute(conn)
        .await?;
        Ok(())
    }

    async fn down(&self, conn: &mut PgConnection) -> Result<(), Error> {
        sqlx::query(
            r#"
            ALTER TABLE users DROP COLUMN IF EXISTS state_doc_id;
            "#,
        )
        .execute(conn)
        .await?;
        Ok(())
    }
}
