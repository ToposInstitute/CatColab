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

        // Shared helper: fetches ref metadata, builds permissions JSON, and
        // sends an 'upsert' notification for a single user. Written in PL/pgSQL
        // (not declared STABLE) so it sees the current transaction state — this
        // is important because triggers may fire after rows were inserted
        // earlier in the same transaction.
        sqlx::query(
            r#"
            CREATE OR REPLACE FUNCTION notify_user_state_upsert(
                p_ref_id UUID,
                p_user_id TEXT
            ) RETURNS void AS $$
            DECLARE
                v_name TEXT;
                v_type_name TEXT;
                v_theory TEXT;
                v_created_at TIMESTAMPTZ;
                v_ref_deleted_at TIMESTAMPTZ;
                v_permissions JSON;
                v_users JSON;
                v_parent UUID;
            BEGIN
                -- Get ref metadata from head snapshot
                SELECT
                    snapshots.content->>'name',
                    snapshots.content->>'type',
                    snapshots.content->>'theory',
                    refs.created,
                    refs.deleted_at,
                    COALESCE(
                        snapshots.content->'diagramIn'->>'_id',
                        snapshots.content->'analysisOf'->>'_id'
                    )::uuid
                INTO v_name, v_type_name, v_theory, v_created_at, v_ref_deleted_at, v_parent
                FROM refs
                JOIN snapshots ON snapshots.id = refs.head
                WHERE refs.id = p_ref_id;

                -- Build permissions JSON array (user_id and level only)
                SELECT COALESCE(json_agg(json_build_object(
                    'user_id', p.subject,
                    'level', p.level::text
                ) ORDER BY p.level DESC), '[]'::json)
                INTO v_permissions
                FROM permissions p
                WHERE p.object = p_ref_id;

                -- Build users JSON object (user_id -> {username, display_name})
                SELECT COALESCE(json_object_agg(
                    u.id, json_build_object(
                        'username', u.username,
                        'display_name', u.display_name
                    )
                ), '{}'::json)
                INTO v_users
                FROM users u
                WHERE u.id IN (
                    SELECT p.subject FROM permissions p
                    WHERE p.object = p_ref_id AND p.subject IS NOT NULL
                );

                -- Send upsert notification
                PERFORM pg_notify('user_state_subscription',
                    json_build_object(
                        'kind', 'upsert',
                        'user_id', p_user_id,
                        'ref_id', p_ref_id,
                        'name', v_name,
                        'type_name', v_type_name,
                        'theory', v_theory,
                        'permissions', v_permissions,
                        'users', v_users,
                        'created_at', floor(extract(epoch FROM v_created_at) * 1000)::bigint,
                        'deleted_at', CASE WHEN v_ref_deleted_at IS NOT NULL
                            THEN floor(extract(epoch FROM v_ref_deleted_at) * 1000)::bigint
                            ELSE NULL END,
                        'parent', v_parent
                    )::text
                );
            END
            $$ LANGUAGE plpgsql;
            "#,
        )
        .execute(&mut *tx)
        .await?;

        // Notify affected users when refs change (INSERT or UPDATE on refs).
        sqlx::query(
            r#"
            CREATE OR REPLACE FUNCTION notify_refs_change() RETURNS trigger AS $$
            DECLARE
                affected_user TEXT;
            BEGIN
                FOR affected_user IN
                    SELECT subject FROM permissions WHERE object = NEW.id AND subject IS NOT NULL
                LOOP
                    PERFORM notify_user_state_upsert(NEW.id, affected_user);
                END LOOP;
                RETURN NEW;
            END
            $$ LANGUAGE plpgsql;
            "#,
        )
        .execute(&mut *tx)
        .await?;

        // Notify affected user when permissions change.
        sqlx::query(
            r#"
            CREATE OR REPLACE FUNCTION notify_permissions_change() RETURNS trigger AS $$
            BEGIN
                -- Handle INSERT and UPDATE: send full upsert for the new subject
                IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
                    IF NEW.subject IS NOT NULL THEN
                        PERFORM notify_user_state_upsert(NEW.object, NEW.subject);
                    END IF;
                END IF;

                -- Handle UPDATE where subject changed: revoke old subject's access
                IF TG_OP = 'UPDATE' AND OLD.subject IS NOT NULL AND OLD.subject IS DISTINCT FROM NEW.subject THEN
                    PERFORM pg_notify('user_state_subscription',
                        json_build_object(
                            'kind', 'revoke',
                            'user_id', OLD.subject,
                            'ref_id', OLD.object
                        )::text
                    );
                END IF;

                -- Handle DELETE: revoke the deleted subject's access
                IF TG_OP = 'DELETE' THEN
                    IF OLD.subject IS NOT NULL THEN
                        PERFORM pg_notify('user_state_subscription',
                            json_build_object(
                                'kind', 'revoke',
                                'user_id', OLD.subject,
                                'ref_id', OLD.object
                            )::text
                        );
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

        // Notify affected users when snapshots change (UPDATE on snapshots).
        // This handles autosave operations that update the head snapshot content.
        sqlx::query(
            r#"
            CREATE OR REPLACE FUNCTION notify_snapshot_change() RETURNS trigger AS $$
            DECLARE
                v_ref_id UUID;
                affected_user TEXT;
            BEGIN
                -- Find the ref that has this snapshot as its head
                SELECT id INTO v_ref_id FROM refs WHERE head = NEW.id;

                -- If no ref uses this as head, nothing to do
                IF v_ref_id IS NULL THEN
                    RETURN NEW;
                END IF;

                FOR affected_user IN
                    SELECT subject FROM permissions WHERE object = v_ref_id AND subject IS NOT NULL
                LOOP
                    PERFORM notify_user_state_upsert(v_ref_id, affected_user);
                END LOOP;
                RETURN NEW;
            END
            $$ LANGUAGE plpgsql;
            "#,
        )
        .execute(&mut *tx)
        .await?;

        // Notify when a user's display_name or username changes.
        // Sends a single profile_update notification. The Rust handler updates
        // the user's own profile and the users map in all affected users' state docs.
        sqlx::query(
            r#"
            CREATE OR REPLACE FUNCTION notify_user_change() RETURNS trigger AS $$
            BEGIN
                PERFORM pg_notify('user_state_subscription',
                    json_build_object(
                        'kind', 'profile_update',
                        'user_id', NEW.id,
                        'username', NEW.username,
                        'display_name', NEW.display_name
                    )::text
                );
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

        sqlx::query(r#"DROP TRIGGER IF EXISTS snapshots_notify_trigger ON snapshots;"#)
            .execute(&mut *tx)
            .await?;

        sqlx::query(r#"DROP TRIGGER IF EXISTS users_notify_trigger ON users;"#)
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

        sqlx::query(
            r#"
            CREATE TRIGGER permissions_notify_trigger
            AFTER INSERT OR UPDATE OR DELETE ON permissions
            FOR EACH ROW EXECUTE FUNCTION notify_permissions_change();
            "#,
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            CREATE TRIGGER snapshots_notify_trigger
            AFTER UPDATE ON snapshots
            FOR EACH ROW EXECUTE FUNCTION notify_snapshot_change();
            "#,
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            CREATE TRIGGER users_notify_trigger
            AFTER UPDATE OF display_name, username ON users
            FOR EACH ROW
            WHEN (OLD.display_name IS DISTINCT FROM NEW.display_name
               OR OLD.username IS DISTINCT FROM NEW.username)
            EXECUTE FUNCTION notify_user_change();
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

        sqlx::query(r#"DROP TRIGGER IF EXISTS snapshots_notify_trigger ON snapshots;"#)
            .execute(&mut *tx)
            .await?;

        sqlx::query(r#"DROP TRIGGER IF EXISTS users_notify_trigger ON users;"#)
            .execute(&mut *tx)
            .await?;

        sqlx::query(r#"DROP FUNCTION IF EXISTS notify_refs_change;"#)
            .execute(&mut *tx)
            .await?;

        sqlx::query(r#"DROP FUNCTION IF EXISTS notify_permissions_change;"#)
            .execute(&mut *tx)
            .await?;

        sqlx::query(r#"DROP FUNCTION IF EXISTS notify_snapshot_change;"#)
            .execute(&mut *tx)
            .await?;

        sqlx::query(r#"DROP FUNCTION IF EXISTS notify_user_change;"#)
            .execute(&mut *tx)
            .await?;

        // Drop the shared helper last since trigger functions depended on it.
        sqlx::query(r#"DROP FUNCTION IF EXISTS notify_user_state_upsert;"#)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(())
    }
}
