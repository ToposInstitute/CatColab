use sqlx::{PgConnection, PgPool, Postgres};
use sqlx_migrator::Migration;
use sqlx_migrator::Operation;
use sqlx_migrator::error::Error;
use sqlx_migrator::vec_box;

use crate::storage::PostgresStorage;

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

    fn is_atomic(&self) -> bool {
        false
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
        .execute(&mut *conn)
        .await?;

        let database_url = dotenvy::var("DATABASE_URL").map_err(|e| {
            let err: Box<dyn std::error::Error + Send + Sync> =
                format!("DATABASE_URL not set: {e}").into();
            err
        })?;
        let pool = PgPool::connect(&database_url).await?;

        let repo: samod::Repo = samod::Repo::build_tokio()
            .with_storage(PostgresStorage::new(pool.clone()))
            .load()
            .await;

        let users: Vec<(String,)> =
            sqlx::query_as("SELECT id FROM users WHERE state_doc_id IS NULL")
                .fetch_all(&pool)
                .await?;

        for (user_id,) in &users {
            let doc = automerge::Automerge::new();
            let doc_handle = repo.create(doc).await.map_err(|e| {
                let err: Box<dyn std::error::Error + Send + Sync> = Box::new(e);
                err
            })?;
            let doc_id = doc_handle.document_id().to_string();

            sqlx::query("UPDATE users SET state_doc_id = $2 WHERE id = $1")
                .bind(user_id)
                .bind(&doc_id)
                .execute(&pool)
                .await?;

            tracing::info!(user_id = %user_id, doc_id = %doc_id, "Created user state document");
        }

        repo.stop().await;

        sqlx::query(
            r#"
            ALTER TABLE users ALTER COLUMN state_doc_id SET NOT NULL;
            "#,
        )
        .execute(&pool)
        .await?;

        pool.close().await;

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
