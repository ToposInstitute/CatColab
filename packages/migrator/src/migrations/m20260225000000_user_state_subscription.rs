use sqlx::{Acquire, PgConnection, Postgres};
use sqlx_migrator::Migration;
use sqlx_migrator::Operation;
use sqlx_migrator::error::Error;
use sqlx_migrator::vec_box;

pub(crate) struct UserStateSubscription;

#[async_trait::async_trait]
impl Migration<Postgres> for UserStateSubscription {
    fn app(&self) -> &str {
        "backend"
    }

    fn name(&self) -> &str {
        "m20260130120000_user_state_subscription"
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
            ALTER TABLE users ADD COLUMN IF NOT EXISTS state_doc_id TEXT UNIQUE;
            "#,
        )
        .execute(&mut *tx)
        .await?;

        // Shared helper: extracts document relations from snapshot JSON content.
        // Given the JSONB content of a snapshot, recursively walks the JSON tree
        // and returns a JSON array of {ref_id, relationType} objects for every
        // node that has both `_id` and `type` keys.
        sqlx::query(
            r#"
            CREATE OR REPLACE FUNCTION extract_snapshot_relations(p_content JSONB)
            RETURNS JSON AS $$
                WITH RECURSIVE json_nodes(node) AS (
                    SELECT p_content
                    UNION ALL
                    SELECT child.value
                    FROM json_nodes
                    CROSS JOIN LATERAL (
                        SELECT value
                        FROM jsonb_each(json_nodes.node)
                        WHERE jsonb_typeof(json_nodes.node) = 'object'
                        UNION ALL
                        SELECT value
                        FROM jsonb_array_elements(json_nodes.node)
                        WHERE jsonb_typeof(json_nodes.node) = 'array'
                    ) AS child
                )
                SELECT COALESCE(
                    json_agg(json_build_object('ref_id', relation.ref_id, 'relationType', relation.relation_type)),
                    '[]'::json
                )
                FROM (
                    SELECT DISTINCT
                        json_nodes.node->>'_id' AS ref_id,
                        json_nodes.node->>'type' AS relation_type
                    FROM json_nodes
                    WHERE
                        jsonb_typeof(json_nodes.node) = 'object'
                        AND json_nodes.node ? '_id'
                        AND json_nodes.node ? 'type'
                ) AS relation
            $$ LANGUAGE sql;
            "#,
        )
        .execute(&mut *tx)
        .await?;

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
                v_depends_on JSON;
            BEGIN
                -- Get ref metadata from head snapshot
                SELECT
                    snapshots.content->>'name',
                    snapshots.content->>'type',
                    snapshots.content->>'theory',
                    refs.created,
                    refs.deleted_at,
                    extract_snapshot_relations(snapshots.content)
                INTO v_name, v_type_name, v_theory, v_created_at, v_ref_deleted_at, v_depends_on
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
                        'depends_on', v_depends_on
                    )::text
                );
            END
            $$ LANGUAGE plpgsql;
            "#,
        )
        .execute(&mut *tx)
        .await?;

        // Notify affected users when refs change (INSERT or UPDATE on refs).
        // Notifies users with explicit permissions, plus all users with state
        // docs if the ref is publicly accessible.
        sqlx::query(
            r#"
            CREATE OR REPLACE FUNCTION notify_refs_change() RETURNS trigger AS $$
            DECLARE
                affected_user TEXT;
            BEGIN
                -- If public, notify all users with state docs (superset of
                -- users with explicit permissions).
                IF EXISTS (SELECT 1 FROM permissions WHERE object = NEW.id AND subject IS NULL) THEN
                    FOR affected_user IN
                        SELECT id FROM users WHERE state_doc_id IS NOT NULL
                    LOOP
                        PERFORM notify_user_state_upsert(NEW.id, affected_user);
                    END LOOP;
                ELSE
                    -- Not public: notify only users with explicit permissions
                    FOR affected_user IN
                        SELECT subject FROM permissions WHERE object = NEW.id AND subject IS NOT NULL
                    LOOP
                        PERFORM notify_user_state_upsert(NEW.id, affected_user);
                    END LOOP;
                END IF;

                RETURN NEW;
            END
            $$ LANGUAGE plpgsql;
            "#,
        )
        .execute(&mut *tx)
        .await?;

        // Notify affected user when permissions change.
        // When a public permission (subject IS NULL) is added, all users with
        // state docs are notified. Revoking public permissions is not currently
        // supported by the application API, so we don't handle that case.
        sqlx::query(
            r#"
            CREATE OR REPLACE FUNCTION notify_permissions_change() RETURNS trigger AS $$
            DECLARE
                affected_user TEXT;
            BEGIN
                -- Handle INSERT and UPDATE: send full upsert for the new subject
                IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
                    IF NEW.subject IS NOT NULL THEN
                        PERFORM notify_user_state_upsert(NEW.object, NEW.subject);
                    ELSE
                        -- Public permission added: notify all users with state
                        -- docs (includes users with explicit permissions, since
                        -- they also need to see the updated permissions list).
                        FOR affected_user IN
                            SELECT id FROM users WHERE state_doc_id IS NOT NULL
                        LOOP
                            PERFORM notify_user_state_upsert(NEW.object, affected_user);
                        END LOOP;
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

        sqlx::query(r#"DROP TRIGGER IF EXISTS users_notify_trigger ON users;"#)
            .execute(&mut *tx)
            .await?;

        sqlx::query(r#"DROP FUNCTION IF EXISTS notify_refs_change;"#)
            .execute(&mut *tx)
            .await?;

        sqlx::query(r#"DROP FUNCTION IF EXISTS notify_permissions_change;"#)
            .execute(&mut *tx)
            .await?;

        sqlx::query(r#"DROP FUNCTION IF EXISTS notify_user_change;"#)
            .execute(&mut *tx)
            .await?;

        // Drop the shared helpers last since trigger functions depended on them.
        sqlx::query(r#"DROP FUNCTION IF EXISTS notify_user_state_upsert;"#)
            .execute(&mut *tx)
            .await?;

        sqlx::query(r#"DROP FUNCTION IF EXISTS extract_snapshot_relations;"#)
            .execute(&mut *tx)
            .await?;

        sqlx::query(r#"ALTER TABLE users DROP COLUMN IF EXISTS state_doc_id;"#)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(())
    }
}
