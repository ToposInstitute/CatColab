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

        // Function to notify affected users when refs change
        sqlx::query(
            r#"
            CREATE OR REPLACE FUNCTION notify_user_state_change() RETURNS trigger AS $$
            DECLARE
                affected_user TEXT;
            BEGIN
                -- Find all users with permissions on this ref and notify each
                FOR affected_user IN
                    SELECT subject FROM permissions WHERE object = NEW.id AND subject IS NOT NULL
                LOOP
                    PERFORM pg_notify('user_state_subscription', json_build_object('user_id', affected_user)::text);
                END LOOP;
                RETURN NEW;
            END
            $$ LANGUAGE plpgsql;
            "#,
        )
        .execute(&mut *tx)
        .await?;

        // Function to notify affected user when permissions change
        sqlx::query(
            r#"
            CREATE OR REPLACE FUNCTION notify_permissions_change() RETURNS trigger AS $$
            DECLARE
                affected_user TEXT;
            BEGIN
                -- Handle INSERT and UPDATE
                IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
                    IF NEW.subject IS NOT NULL THEN
                        PERFORM pg_notify('user_state_subscription', json_build_object('user_id', NEW.subject)::text);
                    END IF;
                END IF;
                -- Handle UPDATE where subject changed (also notify old subject)
                IF TG_OP = 'UPDATE' AND OLD.subject IS NOT NULL AND OLD.subject IS DISTINCT FROM NEW.subject THEN
                    PERFORM pg_notify('user_state_subscription', json_build_object('user_id', OLD.subject)::text);
                END IF;
                -- Handle DELETE
                IF TG_OP = 'DELETE' THEN
                    IF OLD.subject IS NOT NULL THEN
                        PERFORM pg_notify('user_state_subscription', json_build_object('user_id', OLD.subject)::text);
                    END IF;
                    RETURN OLD;
                END IF;
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

        sqlx::query(r#"DROP TRIGGER IF EXISTS permissions_notify_trigger ON permissions;"#)
            .execute(&mut *tx)
            .await?;

        sqlx::query(
            r#"
            CREATE TRIGGER refs_notify_trigger
            AFTER INSERT OR UPDATE ON refs
            FOR EACH ROW EXECUTE FUNCTION notify_user_state_change();
            "#,
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            CREATE TRIGGER permissions_notify_trigger
            AFTER INSERT OR UPDATE OR DELETE ON permissions
            FOR EACH ROW EXECUTE FUNCTION notify_permissions_change();
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

        sqlx::query(r#"DROP TRIGGER IF EXISTS permissions_notify_trigger ON permissions;"#)
            .execute(&mut *tx)
            .await?;

        sqlx::query(r#"DROP FUNCTION IF EXISTS notify_user_state_change;"#)
            .execute(&mut *tx)
            .await?;

        sqlx::query(r#"DROP FUNCTION IF EXISTS notify_permissions_change;"#)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(())
    }
}
