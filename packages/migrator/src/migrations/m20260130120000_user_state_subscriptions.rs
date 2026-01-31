use sqlx::{Acquire, PgConnection, Postgres};
use sqlx_migrator::Migration;
use sqlx_migrator::Operation;
use sqlx_migrator::error::Error;
use sqlx_migrator::vec_box;

pub(crate) struct UserStateSubscriptions;

#[async_trait::async_trait]
impl Migration<Postgres> for UserStateSubscriptions {
    fn app(&self) -> &str {
        "backend"
    }

    fn name(&self) -> &str {
        "m20260130120000_user_state_subscriptions"
    }

    fn parents(&self) -> Vec<Box<dyn Migration<Postgres>>> {
        vec![]
    }

    fn operations(&self) -> Vec<Box<dyn Operation<Postgres>>> {
        vec_box![MigrationOperation]
    }
}

struct MigrationOperation;

#[async_trait::async_trait]
impl Operation<Postgres> for MigrationOperation {
    async fn up(&self, conn: &mut PgConnection) -> Result<(), Error> {
        let mut tx = conn.begin().await?;

        sqlx::query(
            r#"
            CREATE OR REPLACE FUNCTION notify_refs_change() RETURNS trigger AS $$
            DECLARE
                payload JSON;
            BEGIN
                payload := json_build_object(
                    'operation', TG_OP,
                    'ref_id', NEW.id,
                    'head', NEW.head,
                    'deleted_at', NEW.deleted_at
                );
                PERFORM pg_notify('refs_subscription', payload::text);
                RETURN NEW;
            END
            $$ LANGUAGE plpgsql;
            "#,
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query(r#"DROP TRIGGER IF EXISTS refs_notify_trigger ON refs;"#)
            .execute(&mut *tx)
            .await?;

        sqlx::query(
            r#"
            CREATE TRIGGER refs_notify_trigger
            AFTER INSERT OR UPDATE ON refs
            FOR EACH ROW EXECUTE FUNCTION notify_refs_change();
            "#,
        )
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(())
    }

    async fn down(&self, conn: &mut PgConnection) -> Result<(), Error> {
        let mut tx = conn.begin().await?;

        sqlx::query(r#"DROP TRIGGER IF EXISTS refs_notify_trigger ON refs;"#)
            .execute(&mut *tx)
            .await?;

        sqlx::query(r#"DROP FUNCTION IF EXISTS notify_refs_change;"#)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(())
    }
}
