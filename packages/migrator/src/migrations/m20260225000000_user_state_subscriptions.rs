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

        // Function to notify affected users when refs change (UPDATE on refs).
        //
        // All queries are inlined in PL/pgSQL rather than calling get_ref_stubs
        // or get_max_permission (which are STABLE SQL functions). PostgreSQL
        // optimizes STABLE functions with a snapshot from statement start, so
        // they cannot see rows inserted earlier in the same transaction. PL/pgSQL
        // code in a trigger sees the current transaction state.
        sqlx::query(
            r#"
            CREATE OR REPLACE FUNCTION notify_refs_change() RETURNS trigger AS $$
            DECLARE
                affected_user TEXT;
                v_name TEXT;
                v_type_name TEXT;
                v_theory TEXT;
                v_created_at TIMESTAMPTZ;
                v_permissions JSON;
                v_parent UUID;
            BEGIN
                -- Inline: get name, type, theory, created_at, parent from the ref's head snapshot
                SELECT
                    snapshots.content->>'name',
                    snapshots.content->>'type',
                    snapshots.content->>'theory',
                    refs.created,
                    COALESCE(
                        snapshots.content->'diagramIn'->>'_id',
                        snapshots.content->'analysisOf'->>'_id'
                    )::uuid
                INTO v_name, v_type_name, v_theory, v_created_at, v_parent
                FROM refs
                JOIN snapshots ON snapshots.id = refs.head
                WHERE refs.id = NEW.id;

                -- Build permissions JSON array for this ref
                SELECT COALESCE(json_agg(json_build_object(
                    'user_id', p.subject,
                    'username', u.username,
                    'display_name', u.display_name,
                    'level', p.level::text
                ) ORDER BY p.level DESC), '[]'::json)
                INTO v_permissions
                FROM permissions p
                LEFT JOIN users u ON u.id = p.subject
                WHERE p.object = NEW.id;

                -- For each user with a permission on this ref, send a notification.
                FOR affected_user IN
                    SELECT subject FROM permissions WHERE object = NEW.id AND subject IS NOT NULL
                LOOP
                    PERFORM pg_notify('user_state_subscription',
                        json_build_object(
                            'kind', 'upsert',
                            'user_id', affected_user,
                            'ref_id', NEW.id,
                            'name', v_name,
                            'type_name', v_type_name,
                            'theory', v_theory,
                            'permissions', v_permissions,
                            'created_at', floor(extract(epoch FROM v_created_at) * 1000)::bigint,
                            'deleted_at', CASE WHEN NEW.deleted_at IS NOT NULL
                                THEN floor(extract(epoch FROM NEW.deleted_at) * 1000)::bigint
                                ELSE NULL END,
                            'parent', v_parent
                        )::text
                    );
                END LOOP;
                RETURN NEW;
            END
            $$ LANGUAGE plpgsql;
            "#,
        )
        .execute(&mut *tx)
        .await?;

        // Function to notify affected user when permissions change.
        //
        // Queries are inlined for the same reason as notify_refs_change:
        // STABLE SQL functions cannot see rows from the current transaction.
        sqlx::query(
            r#"
            CREATE OR REPLACE FUNCTION notify_permissions_change() RETURNS trigger AS $$
            DECLARE
                v_ref_id UUID;
                v_subject TEXT;
                v_name TEXT;
                v_type_name TEXT;
                v_theory TEXT;
                v_created_at TIMESTAMPTZ;
                v_ref_deleted_at TIMESTAMPTZ;
                v_permissions JSON;
                v_parent UUID;
            BEGIN
                -- Handle INSERT and UPDATE: send full DocInfo for the new subject
                IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
                    IF NEW.subject IS NOT NULL THEN
                        v_ref_id := NEW.object;
                        v_subject := NEW.subject;

                        -- Inline: get ref metadata from head snapshot
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
                        WHERE refs.id = v_ref_id;

                        -- Build permissions JSON array for this ref
                        SELECT COALESCE(json_agg(json_build_object(
                            'user_id', p.subject,
                            'username', u.username,
                            'display_name', u.display_name,
                            'level', p.level::text
                        ) ORDER BY p.level DESC), '[]'::json)
                        INTO v_permissions
                        FROM permissions p
                        LEFT JOIN users u ON u.id = p.subject
                        WHERE p.object = v_ref_id;

                        PERFORM pg_notify('user_state_subscription',
                            json_build_object(
                                'kind', 'upsert',
                                'user_id', v_subject,
                                'ref_id', v_ref_id,
                                'name', v_name,
                                'type_name', v_type_name,
                                'theory', v_theory,
                                'permissions', v_permissions,
                                'created_at', floor(extract(epoch FROM v_created_at) * 1000)::bigint,
                                'deleted_at', CASE WHEN v_ref_deleted_at IS NOT NULL
                                    THEN floor(extract(epoch FROM v_ref_deleted_at) * 1000)::bigint
                                    ELSE NULL END,
                                'parent', v_parent
                            )::text
                        );
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

        // Function to notify affected users when snapshots change (UPDATE on snapshots).
        // This handles autosave operations that update the head snapshot content.
        sqlx::query(
            r#"
            CREATE OR REPLACE FUNCTION notify_snapshot_change() RETURNS trigger AS $$
            DECLARE
                v_ref_id UUID;
                affected_user TEXT;
                v_name TEXT;
                v_type_name TEXT;
                v_theory TEXT;
                v_created_at TIMESTAMPTZ;
                v_ref_deleted_at TIMESTAMPTZ;
                v_permissions JSON;
                v_parent UUID;
            BEGIN
                -- Find the ref that has this snapshot as its head
                SELECT id INTO v_ref_id FROM refs WHERE head = NEW.id;

                -- If no ref uses this as head, nothing to do
                IF v_ref_id IS NULL THEN
                    RETURN NEW;
                END IF;

                -- Get metadata from the NEW snapshot content and ref
                v_name := NEW.content->>'name';
                v_type_name := NEW.content->>'type';
                v_theory := NEW.content->>'theory';
                v_parent := COALESCE(
                    NEW.content->'diagramIn'->>'_id',
                    NEW.content->'analysisOf'->>'_id'
                )::uuid;

                SELECT created, deleted_at
                INTO v_created_at, v_ref_deleted_at
                FROM refs
                WHERE id = v_ref_id;

                -- Build permissions JSON array for this ref (shared by all notifications)
                SELECT COALESCE(json_agg(json_build_object(
                    'user_id', p.subject,
                    'username', u.username,
                    'display_name', u.display_name,
                    'level', p.level::text
                ) ORDER BY p.level DESC), '[]'::json)
                INTO v_permissions
                FROM permissions p
                LEFT JOIN users u ON u.id = p.subject
                WHERE p.object = v_ref_id;

                -- For each user with a permission on this ref, send a notification
                FOR affected_user IN
                    SELECT subject FROM permissions WHERE object = v_ref_id AND subject IS NOT NULL
                LOOP
                    PERFORM pg_notify('user_state_subscription',
                        json_build_object(
                            'kind', 'upsert',
                            'user_id', affected_user,
                            'ref_id', v_ref_id,
                            'name', v_name,
                            'type_name', v_type_name,
                            'theory', v_theory,
                            'permissions', v_permissions,
                            'created_at', floor(extract(epoch FROM v_created_at) * 1000)::bigint,
                            'deleted_at', CASE WHEN v_ref_deleted_at IS NOT NULL
                                THEN floor(extract(epoch FROM v_ref_deleted_at) * 1000)::bigint
                                ELSE NULL END,
                            'parent', v_parent
                        )::text
                    );
                END LOOP;
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

        sqlx::query(r#"DROP FUNCTION IF EXISTS notify_refs_change;"#)
            .execute(&mut *tx)
            .await?;

        sqlx::query(r#"DROP FUNCTION IF EXISTS notify_permissions_change;"#)
            .execute(&mut *tx)
            .await?;

        sqlx::query(r#"DROP FUNCTION IF EXISTS notify_snapshot_change;"#)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(())
    }
}
