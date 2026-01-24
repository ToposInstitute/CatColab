use sqlx::{Acquire, PgConnection, Postgres};
use sqlx_migrator::Operation;
use sqlx_migrator::error::Error;
use sqlx_migrator::migration;
use sqlx_migrator::vec_box;

pub(crate) struct AddUserFkCascade;

migration!(
    Postgres,
    AddUserFkCascade,
    "backend",
    "20260124120000_add_user_fk_cascade",
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
            ALTER TABLE permissions
            DROP CONSTRAINT permissions_subject_fkey;
            ",
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "
            ALTER TABLE permissions
            ADD CONSTRAINT permissions_subject_fkey
            FOREIGN KEY (subject) REFERENCES users (id)
            ON UPDATE CASCADE
            ON DELETE CASCADE;
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
            ALTER TABLE permissions
            DROP CONSTRAINT permissions_subject_fkey;
            ",
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "
            ALTER TABLE permissions
            ADD CONSTRAINT permissions_subject_fkey
            FOREIGN KEY (subject) REFERENCES users (id);
            ",
        )
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(())
    }
}
