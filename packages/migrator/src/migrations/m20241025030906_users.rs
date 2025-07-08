use sqlx::{Acquire, PgConnection, Postgres};
use sqlx_migrator::Operation;
use sqlx_migrator::error::Error;
use sqlx_migrator::migration;
use sqlx_migrator::vec_box;

pub(crate) struct Users;
migration!(
    Postgres,
    Users,
    "backend",
    "20241025030906_users",
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
            CREATE TABLE users (
                id TEXT PRIMARY KEY,
                created TIMESTAMPTZ NOT NULL,
                signed_in TIMESTAMPTZ NOT NULL,
                username TEXT UNIQUE,
                display_name TEXT
            );
            ",
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "
            CREATE TYPE permission_level AS ENUM ('read', 'write', 'maintain', 'own');
            ",
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "
            CREATE TABLE permissions (
                subject TEXT REFERENCES users (id),
                object UUID NOT NULL REFERENCES refs (id),
                level permission_level NOT NULL,
                CONSTRAINT permissions_is_relation UNIQUE (subject, object)
            );
            ",
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "
            CREATE INDEX ON permissions (object);
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
            DROP TABLE permissions, users;
            ",
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "
            DROP TYPE permission_level;
            ",
        )
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(())
    }
}
