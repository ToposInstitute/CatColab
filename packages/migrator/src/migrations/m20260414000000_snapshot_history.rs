use sqlx::postgres::PgConnectOptions;
use sqlx::{Acquire, PgConnection, PgPool, Postgres, Row};
use sqlx_migrator::Migration;
use sqlx_migrator::Operation;
use sqlx_migrator::error::Error;
use sqlx_migrator::vec_box;
use uuid::Uuid;

use crate::storage::PostgresStorage;

pub(crate) struct SnapshotHistory;

#[async_trait::async_trait]
impl Migration<Postgres> for SnapshotHistory {
    fn app(&self) -> &str {
        "backend"
    }

    fn name(&self) -> &str {
        "m20260414000000_snapshot_history"
    }

    fn parents(&self) -> Vec<Box<dyn Migration<Postgres>>> {
        vec![]
    }

    fn operations(&self) -> Vec<Box<dyn Operation<Postgres>>> {
        vec_box![
            MoveDocIdToRefs,
            AddHeadsToSnapshots,
            RenameSnapshotTimestamp,
            PopulateHeads,
            DropDocIdFromSnapshots,
            RenameHeadAndDropGetRefStubs,
            AddParentToSnapshots,
            AddCurrentSnapshotUpdatedAt
        ]
    }

    fn is_atomic(&self) -> bool {
        false
    }
}

/// Step 1: Add `doc_id` column to `refs`, populated from each ref's head snapshot.
struct MoveDocIdToRefs;

#[async_trait::async_trait]
impl Operation<Postgres> for MoveDocIdToRefs {
    async fn up(&self, conn: &mut PgConnection) -> Result<(), Error> {
        let mut tx = conn.begin().await?;

        sqlx::query("ALTER TABLE refs ADD COLUMN doc_id TEXT").execute(&mut *tx).await?;

        sqlx::query(
            "UPDATE refs SET doc_id = (SELECT doc_id FROM snapshots WHERE snapshots.id = refs.head)",
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query("ALTER TABLE refs ALTER COLUMN doc_id SET NOT NULL")
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(())
    }

    async fn down(&self, conn: &mut PgConnection) -> Result<(), Error> {
        sqlx::query("ALTER TABLE refs DROP COLUMN IF EXISTS doc_id")
            .execute(conn)
            .await?;
        Ok(())
    }
}

/// Step 2: Add `heads` column to `snapshots` (nullable initially).
struct AddHeadsToSnapshots;

#[async_trait::async_trait]
impl Operation<Postgres> for AddHeadsToSnapshots {
    async fn up(&self, conn: &mut PgConnection) -> Result<(), Error> {
        sqlx::query("ALTER TABLE snapshots ADD COLUMN heads BYTEA[]")
            .execute(conn)
            .await?;
        Ok(())
    }

    async fn down(&self, conn: &mut PgConnection) -> Result<(), Error> {
        sqlx::query("ALTER TABLE snapshots DROP COLUMN IF EXISTS heads")
            .execute(conn)
            .await?;
        Ok(())
    }
}

/// Step 2.5: Rename `snapshots.last_updated` to `snapshots.created_at`.
struct RenameSnapshotTimestamp;

#[async_trait::async_trait]
impl Operation<Postgres> for RenameSnapshotTimestamp {
    async fn up(&self, conn: &mut PgConnection) -> Result<(), Error> {
        sqlx::query("ALTER TABLE snapshots RENAME COLUMN last_updated TO created_at")
            .execute(conn)
            .await?;
        Ok(())
    }

    async fn down(&self, conn: &mut PgConnection) -> Result<(), Error> {
        sqlx::query("ALTER TABLE snapshots RENAME COLUMN created_at TO last_updated")
            .execute(conn)
            .await?;
        Ok(())
    }
}

/// Step 3: Populate `heads` for each snapshot.
///
/// For each snapshot, try to load the Automerge document from samod using
/// the snapshot's `doc_id`. If found, extract its heads. Otherwise, create a
/// new Automerge document from the snapshot's JSON content and use its heads.
struct PopulateHeads;

#[async_trait::async_trait]
impl Operation<Postgres> for PopulateHeads {
    async fn up(&self, conn: &mut PgConnection) -> Result<(), Error> {
        let pool = pool_for_current_database(conn).await?;

        let repo: samod::Repo = samod::Repo::build_tokio()
            .with_storage(PostgresStorage::new(pool.clone()))
            .load()
            .await;

        // Fetch all snapshots that need heads populated.
        let rows =
            sqlx::query("SELECT id, for_ref, doc_id, content FROM snapshots WHERE heads IS NULL")
                .fetch_all(&pool)
                .await?;

        for row in &rows {
            let snapshot_id: i32 = row.get("id");
            let ref_id: Uuid = row.get("for_ref");
            let doc_id_str: &str = row.get("doc_id");
            let content: serde_json::Value = row.get("content");

            // Try to load the Automerge document via samod.
            let heads = match load_heads_via_samod(&repo, doc_id_str).await {
                Some(heads) => heads,
                None => {
                    // Fallback: create an Automerge doc from JSON content
                    // and add it to the repo so it's persisted in storage.
                    // Update refs.doc_id to point to the newly created document.
                    let (heads, new_doc_id) = create_doc_in_repo(&repo, &content).await?;

                    sqlx::query("UPDATE refs SET doc_id = $1 WHERE id = $2")
                        .bind(&new_doc_id)
                        .bind(ref_id)
                        .execute(&pool)
                        .await?;

                    heads
                }
            };

            let heads_bytes: Vec<Vec<u8>> = heads.iter().map(|h| h.0.to_vec()).collect();

            sqlx::query("UPDATE snapshots SET heads = $1 WHERE id = $2")
                .bind(&heads_bytes)
                .bind(snapshot_id)
                .execute(&pool)
                .await?;
        }

        repo.stop().await;

        // Now make the column NOT NULL.
        sqlx::query("ALTER TABLE snapshots ALTER COLUMN heads SET NOT NULL")
            .execute(&pool)
            .await?;

        pool.close().await;

        Ok(())
    }

    async fn down(&self, conn: &mut PgConnection) -> Result<(), Error> {
        // Make heads nullable again (the column itself is dropped in AddHeadsToSnapshots::down).
        sqlx::query("ALTER TABLE snapshots ALTER COLUMN heads DROP NOT NULL")
            .execute(conn)
            .await?;
        Ok(())
    }
}

/// Create a `PgPool` connected to the same database as the given connection.
///
/// The migrator passes a `PgConnection` but samod needs a `PgPool`. We derive
/// the pool's connect options from `DATABASE_URL` (for server coordinates) and
/// the connection's `current_database()` (for the actual database name). This
/// ensures the pool connects to the correct database even in test environments
/// where `#[sqlx::test]` creates temporary databases.
async fn pool_for_current_database(conn: &mut PgConnection) -> Result<PgPool, Error> {
    let db_name: String =
        sqlx::query_scalar("SELECT current_database()").fetch_one(&mut *conn).await?;

    let base_url = dotenvy::var("DATABASE_URL").map_err(|e| {
        let err: Box<dyn std::error::Error + Send + Sync> =
            format!("DATABASE_URL not set: {e}").into();
        err
    })?;

    let opts: PgConnectOptions = base_url.parse().map_err(|e: sqlx::Error| {
        let err: Box<dyn std::error::Error + Send + Sync> = Box::new(e);
        err
    })?;
    let opts = opts.database(&db_name);

    let pool = PgPool::connect_with(opts).await?;
    Ok(pool)
}

/// Load Automerge heads via samod by finding the document by its ID.
async fn load_heads_via_samod(
    repo: &samod::Repo,
    doc_id_str: &str,
) -> Option<Vec<automerge::ChangeHash>> {
    let doc_id: samod::DocumentId = doc_id_str.parse().ok()?;
    let doc_handle = repo.find(doc_id).await.ok()??;
    Some(doc_handle.with_document(|doc| doc.get_heads().to_vec()))
}

/// Create an Automerge document from JSON content, add it to the repo, and
/// return its heads and new document ID.
async fn create_doc_in_repo(
    repo: &samod::Repo,
    content: &serde_json::Value,
) -> Result<(Vec<automerge::ChangeHash>, String), Error> {
    use notebook_types::automerge_json::populate_automerge_from_json;

    let mut doc = automerge::Automerge::new();
    doc.transact(|tx| {
        populate_automerge_from_json(tx, automerge::ROOT, content)?;
        Ok::<_, automerge::AutomergeError>(())
    })
    .map_err(|e| -> Error {
        Box::<dyn std::error::Error + Send + Sync>::from(format!(
            "Failed to create automerge doc from JSON: {:?}",
            e
        ))
        .into()
    })?;

    let heads = doc.get_heads().to_vec();

    let doc_handle = repo.create(doc).await.map_err(|e| {
        let err: Box<dyn std::error::Error + Send + Sync> = Box::new(e);
        Error::Box(err)
    })?;

    let doc_id = doc_handle.document_id().to_string();

    Ok((heads, doc_id))
}

/// Step 4: Drop `doc_id` from `snapshots`.
struct DropDocIdFromSnapshots;

#[async_trait::async_trait]
impl Operation<Postgres> for DropDocIdFromSnapshots {
    async fn up(&self, conn: &mut PgConnection) -> Result<(), Error> {
        sqlx::query("ALTER TABLE snapshots DROP COLUMN doc_id").execute(conn).await?;
        Ok(())
    }

    async fn down(&self, conn: &mut PgConnection) -> Result<(), Error> {
        let mut tx = conn.begin().await?;

        sqlx::query("ALTER TABLE snapshots ADD COLUMN doc_id TEXT")
            .execute(&mut *tx)
            .await?;

        // Repopulate from refs.doc_id.
        sqlx::query(
            "UPDATE snapshots SET doc_id = (SELECT doc_id FROM refs WHERE refs.id = snapshots.for_ref)",
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query("ALTER TABLE snapshots ALTER COLUMN doc_id SET NOT NULL")
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(())
    }
}

/// Step 5: Rename `refs.head` to `refs.current_snapshot` and drop unused `get_ref_stubs`.
struct RenameHeadAndDropGetRefStubs;

#[async_trait::async_trait]
impl Operation<Postgres> for RenameHeadAndDropGetRefStubs {
    async fn up(&self, conn: &mut PgConnection) -> Result<(), Error> {
        let mut tx = conn.begin().await?;

        // this function is no longer used since the last migration
        sqlx::query("DROP FUNCTION IF EXISTS get_ref_stubs(text, uuid[])")
            .execute(&mut *tx)
            .await?;

        sqlx::query("ALTER TABLE refs RENAME COLUMN head TO current_snapshot")
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(())
    }

    async fn down(&self, conn: &mut PgConnection) -> Result<(), Error> {
        let mut tx = conn.begin().await?;

        sqlx::query("ALTER TABLE refs RENAME COLUMN current_snapshot TO head")
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
}

/// Step 6: Add nullable `parent` column to `snapshots` (FK to `snapshots.id`).
struct AddParentToSnapshots;

#[async_trait::async_trait]
impl Operation<Postgres> for AddParentToSnapshots {
    async fn up(&self, conn: &mut PgConnection) -> Result<(), Error> {
        sqlx::query("ALTER TABLE snapshots ADD COLUMN parent INT REFERENCES snapshots(id)")
            .execute(conn)
            .await?;
        Ok(())
    }

    async fn down(&self, conn: &mut PgConnection) -> Result<(), Error> {
        sqlx::query("ALTER TABLE snapshots DROP COLUMN IF EXISTS parent")
            .execute(conn)
            .await?;
        Ok(())
    }
}

/// Step 7: Add `current_snapshot_updated_at` to `refs`, tracking when the
/// current snapshot pointer was last changed (snapshot created or undo/redo).
struct AddCurrentSnapshotUpdatedAt;

#[async_trait::async_trait]
impl Operation<Postgres> for AddCurrentSnapshotUpdatedAt {
    async fn up(&self, conn: &mut PgConnection) -> Result<(), Error> {
        let mut tx = conn.begin().await?;

        sqlx::query("ALTER TABLE refs ADD COLUMN current_snapshot_updated_at TIMESTAMPTZ")
            .execute(&mut *tx)
            .await?;

        sqlx::query(
            "UPDATE refs SET current_snapshot_updated_at = \
             (SELECT created_at FROM snapshots WHERE id = refs.current_snapshot)",
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query("ALTER TABLE refs ALTER COLUMN current_snapshot_updated_at SET NOT NULL")
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(())
    }

    async fn down(&self, conn: &mut PgConnection) -> Result<(), Error> {
        sqlx::query("ALTER TABLE refs DROP COLUMN IF EXISTS current_snapshot_updated_at")
            .execute(conn)
            .await?;
        Ok(())
    }
}
