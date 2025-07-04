use async_trait::async_trait;
use sqlx::{Acquire, PgConnection, Postgres};
use sqlx_migrator::error::Error;
use sqlx_migrator::{Operation, migration, vec_box};

pub(crate) struct GetRefStubs;

migration!(
    Postgres,
    GetRefStubs,
    "backend",
    "20250704125636_get_ref_stubs",
    vec_box![],
    vec_box![MigrationOperation]
);

struct MigrationOperation;

#[async_trait]
impl Operation<Postgres> for MigrationOperation {
    async fn up(&self, conn: &mut PgConnection) -> Result<(), Error> {
        let mut tx = conn.begin().await?;

        sqlx::query(
            r#"
            CREATE OR REPLACE FUNCTION get_max_permission(
                in_subject   TEXT,
                in_object    UUID
            )
            RETURNS permission_level
            LANGUAGE SQL
            STABLE
            AS $$
            SELECT COALESCE(
                -- 1st preference: the user's explicit permission
                (SELECT p.level
                    FROM permissions AS p
                    WHERE p.object = in_object
                        AND p.subject = in_subject
                    LIMIT 1
                ),
                -- 2nd: the public "read" fallback, if there’s a public row
                (SELECT 'read'::permission_level
                    FROM permissions AS p
                    WHERE p.object = in_object
                        AND p.subject IS NULL
                    LIMIT 1
                 )
            );
            $$;
        "#,
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            CREATE OR REPLACE FUNCTION get_ref_stubs(
                in_searcher_id TEXT,
                in_ref_ids     UUID[]
            )
            RETURNS TABLE (
                ref_id             uuid,
                name               text,
                type_name          text,
                created_at         timestamptz,
                permission_level   permission_level,
                owner_id           text,
                owner_username     text,
                owner_display_name text
            )
            LANGUAGE SQL
            STABLE
            AS $$
            SELECT
              refs.id                                   AS ref_id,
              snapshots.content->>'name'                AS name,
              snapshots.content->>'type'                AS type_name,
              refs.created                              AS created_at,
              get_max_permission(in_searcher_id, refs.id)       AS permission_level,
              owner.id                                  AS owner_id,
              owner.username                            AS owner_username,
              owner.display_name                        AS owner_display_name
            FROM
              unnest(in_ref_ids) WITH ORDINALITY AS unnested_ref_ids(ref_id, ord)
              JOIN refs      ON refs.id      = unnested_ref_ids.ref_id
              JOIN snapshots ON snapshots.id = refs.head
              JOIN permissions p_owner
                ON p_owner.object = refs.id
               AND p_owner.level  = 'own'
              LEFT JOIN users owner
                ON owner.id = p_owner.subject
            ORDER BY
                unnested_ref_ids.ord
            $$;
        "#,
        )
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(())
    }

    async fn down(&self, conn: &mut PgConnection) -> Result<(), Error> {
        sqlx::query("DROP FUNCTION IF EXISTS get_ref_stubs(uuid, uuid[])")
            .execute(conn)
            .await?;
        Ok(())
    }
}
