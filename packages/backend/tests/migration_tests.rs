//! Integration tests for database migrations.
//!
//! These tests require a running PostgreSQL database and verify that
//! migrations apply correctly and produce the expected schema and data.
#[cfg(feature = "integration-tests")]
mod integration_tests {

    use sqlx::PgPool;
    use sqlx::Row;
    use sqlx_migrator::Info;
    use sqlx_migrator::Plan;
    use sqlx_migrator::migrator::{Migrate, Migrator};

    /// Run all migrations on a test database pool.
    async fn run_migrations(pool: &PgPool) {
        let mut conn = pool.acquire().await.unwrap();
        let mut migrator = Migrator::<sqlx::Postgres>::default();
        migrator
            .add_migrations(migrator::migrations())
            .expect("Failed to load migrations");

        let plan = Plan::apply_all();
        migrator.run(&mut *conn, &plan).await.expect("Failed to run migrations");
    }

    /// Insert a test document ref with a snapshot, returning (ref_id, snapshot_id).
    ///
    /// Uses a CTE within a deferred transaction to handle the circular FK
    /// between `refs.head` -> `snapshots.id` and `snapshots.for_ref` -> `refs.id`.
    async fn insert_test_ref_with_snapshot(
        pool: &PgPool,
        content: serde_json::Value,
        doc_id: &str,
    ) -> (uuid::Uuid, i32) {
        let ref_id = uuid::Uuid::now_v7();

        let snapshot_id: i32 = sqlx::query_scalar(
            "WITH snapshot AS (
                INSERT INTO snapshots(for_ref, content, last_updated, doc_id)
                VALUES ($1, $2, NOW(), $3)
                RETURNING id
            )
            INSERT INTO refs(id, head, created)
            VALUES ($1, (SELECT id FROM snapshot), NOW())
            RETURNING (SELECT id FROM snapshot)",
        )
        .bind(ref_id)
        .bind(&content)
        .bind(doc_id)
        .fetch_one(pool)
        .await
        .unwrap();

        (ref_id, snapshot_id)
    }

    /// Run all migrations except the undo-redo migration.
    async fn run_migrations_before_undo_redo(pool: &PgPool) {
        let mut conn = pool.acquire().await.unwrap();
        let mut migrator = Migrator::<sqlx::Postgres>::default();
        migrator
            .add_migrations(migrator::migrations())
            .expect("Failed to load migrations");

        // Apply all migrations, then revert the last one to get "before undo-redo" state.
        let plan = Plan::apply_all();
        migrator.run(&mut *conn, &plan).await.expect("Failed to run migrations");

        let plan = Plan::revert_count(1);
        migrator.run(&mut *conn, &plan).await.expect("Failed to revert last migration");
    }

    /// Apply just the undo-redo migration (assumes all prior migrations are applied).
    async fn apply_undo_redo_migration(pool: &PgPool) {
        let mut conn = pool.acquire().await.unwrap();
        let mut migrator = Migrator::<sqlx::Postgres>::default();
        migrator
            .add_migrations(migrator::migrations())
            .expect("Failed to load migrations");

        let plan = Plan::apply_all();
        migrator.run(&mut *conn, &plan).await.expect("Failed to apply migration");
    }

    /// Revert the undo-redo migration.
    async fn revert_undo_redo_migration(pool: &PgPool) {
        let mut conn = pool.acquire().await.unwrap();
        let mut migrator = Migrator::<sqlx::Postgres>::default();
        migrator
            .add_migrations(migrator::migrations())
            .expect("Failed to load migrations");

        let plan = Plan::revert_count(1);
        migrator.run(&mut *conn, &plan).await.expect("Failed to revert migration");
    }

    // ── Schema tests ──

    #[sqlx::test]
    async fn test_migration_adds_heads_to_snapshots(pool: PgPool) {
        run_migrations(&pool).await;

        // Verify the heads column exists on snapshots.
        let row = sqlx::query(
            "SELECT column_name, data_type, is_nullable
             FROM information_schema.columns
             WHERE table_name = 'snapshots' AND column_name = 'heads'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        let data_type: String = row.get("data_type");
        let is_nullable: String = row.get("is_nullable");
        assert_eq!(data_type, "ARRAY");
        assert_eq!(is_nullable, "NO");
    }

    #[sqlx::test]
    async fn test_migration_moves_doc_id_to_refs(pool: PgPool) {
        run_migrations(&pool).await;

        // doc_id should exist on refs.
        let row = sqlx::query(
            "SELECT column_name, is_nullable
             FROM information_schema.columns
             WHERE table_name = 'refs' AND column_name = 'doc_id'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        let is_nullable: String = row.get("is_nullable");
        assert_eq!(is_nullable, "NO");

        // doc_id should NOT exist on snapshots.
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*)
             FROM information_schema.columns
             WHERE table_name = 'snapshots' AND column_name = 'doc_id'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(count, 0);
    }

    #[sqlx::test]
    async fn test_migration_renames_head_to_current_snapshot(pool: PgPool) {
        run_migrations(&pool).await;

        // current_snapshot should exist on refs.
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*)
             FROM information_schema.columns
             WHERE table_name = 'refs' AND column_name = 'current_snapshot'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(count, 1);

        // head should NOT exist on refs.
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*)
             FROM information_schema.columns
             WHERE table_name = 'refs' AND column_name = 'head'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(count, 0);
    }

    #[sqlx::test]
    async fn test_migration_renames_last_updated_to_created_at(pool: PgPool) {
        run_migrations(&pool).await;

        let created_at_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*)
             FROM information_schema.columns
             WHERE table_name = 'snapshots' AND column_name = 'created_at'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        let last_updated_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*)
             FROM information_schema.columns
             WHERE table_name = 'snapshots' AND column_name = 'last_updated'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(created_at_count, 1, "created_at should exist after migration");
        assert_eq!(last_updated_count, 0, "last_updated should not exist after migration");
    }

    // ── Data migration tests ──

    #[sqlx::test]
    async fn test_migration_populates_heads_from_json_content(pool: PgPool) {
        run_migrations_before_undo_redo(&pool).await;

        let content = serde_json::json!({
            "type": "model",
            "version": "1",
            "name": "Test Model",
            "theory": "category",
            "notebook": {
                "cellOrder": [],
                "cellContents": {}
            }
        });

        let (_ref_id, snapshot_id) =
            insert_test_ref_with_snapshot(&pool, content, "fake-doc-id-123").await;

        // Apply the undo-redo migration.
        apply_undo_redo_migration(&pool).await;

        // The snapshot should now have heads populated.
        let heads: Vec<Vec<u8>> = sqlx::query_scalar("SELECT heads FROM snapshots WHERE id = $1")
            .bind(snapshot_id)
            .fetch_one(&pool)
            .await
            .unwrap();

        assert!(!heads.is_empty(), "heads should be populated");
        // Each head should be 32 bytes (SHA-256 hash).
        for head in &heads {
            assert_eq!(head.len(), 32, "head should be 32 bytes, got: {}", head.len());
        }
    }

    #[sqlx::test]
    async fn test_migration_preserves_doc_id_on_refs(pool: PgPool) {
        run_migrations_before_undo_redo(&pool).await;

        let content = serde_json::json!({
            "type": "model",
            "version": "1",
            "name": "Test",
            "theory": "category",
            "notebook": {
                "cellOrder": [],
                "cellContents": {}
            }
        });

        let original_doc_id = "test-doc-id-abc";
        let (ref_id, _snapshot_id) =
            insert_test_ref_with_snapshot(&pool, content, original_doc_id).await;

        apply_undo_redo_migration(&pool).await;

        // refs should have a doc_id. Since the original doc_id doesn't exist
        // in samod storage, the migration creates a new Automerge doc and
        // updates the doc_id accordingly.
        let stored_doc_id: String = sqlx::query_scalar("SELECT doc_id FROM refs WHERE id = $1")
            .bind(ref_id)
            .fetch_one(&pool)
            .await
            .unwrap();

        assert!(!stored_doc_id.is_empty(), "doc_id should be populated");
        assert_ne!(
            stored_doc_id, original_doc_id,
            "doc_id should be updated to the newly created samod document"
        );
    }

    #[sqlx::test]
    async fn test_migration_handles_multiple_snapshots_per_ref(pool: PgPool) {
        run_migrations_before_undo_redo(&pool).await;

        let doc_id = "multi-snapshot-doc-id";
        let content1 = serde_json::json!({"type": "model", "version": "1", "name": "V1", "theory": "category", "notebook": {"cellOrder": [], "cellContents": {}}});

        let (ref_id, snapshot1_id) = insert_test_ref_with_snapshot(&pool, content1, doc_id).await;

        // Insert second snapshot (older version, not the head).
        let snapshot2_id: i32 = sqlx::query_scalar(
            "INSERT INTO snapshots(for_ref, content, last_updated, doc_id)
             VALUES ($1, $2, NOW(), $3) RETURNING id",
        )
        .bind(ref_id)
        .bind(serde_json::json!({"type": "model", "version": "1", "name": "V0", "theory": "category", "notebook": {"cellOrder": [], "cellContents": {}}}))
        .bind(doc_id)
        .fetch_one(&pool)
        .await
        .unwrap();

        apply_undo_redo_migration(&pool).await;

        // Both snapshots should have heads.
        let heads1: Vec<Vec<u8>> = sqlx::query_scalar("SELECT heads FROM snapshots WHERE id = $1")
            .bind(snapshot1_id)
            .fetch_one(&pool)
            .await
            .unwrap();

        let heads2: Vec<Vec<u8>> = sqlx::query_scalar("SELECT heads FROM snapshots WHERE id = $1")
            .bind(snapshot2_id)
            .fetch_one(&pool)
            .await
            .unwrap();

        assert!(!heads1.is_empty());
        assert!(!heads2.is_empty());

        // Different content should produce different heads.
        assert_ne!(heads1, heads2);
    }

    // ── Rollback tests ──

    #[sqlx::test]
    async fn test_migration_rollback_restores_schema(pool: PgPool) {
        run_migrations_before_undo_redo(&pool).await;

        let content = serde_json::json!({
            "type": "model",
            "version": "1",
            "name": "Rollback Test",
            "theory": "category",
            "notebook": {
                "cellOrder": [],
                "cellContents": {}
            }
        });

        let doc_id = "rollback-doc-id";
        let (ref_id, _) = insert_test_ref_with_snapshot(&pool, content, doc_id).await;

        // Apply then revert.
        apply_undo_redo_migration(&pool).await;
        revert_undo_redo_migration(&pool).await;

        // head column should be back on refs.
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.columns
             WHERE table_name = 'refs' AND column_name = 'head'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count, 1, "head column should be restored");

        // current_snapshot should be gone.
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.columns
             WHERE table_name = 'refs' AND column_name = 'current_snapshot'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count, 0, "current_snapshot should be gone after rollback");

        // doc_id should be back on snapshots.
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.columns
             WHERE table_name = 'snapshots' AND column_name = 'doc_id'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count, 1, "doc_id should be restored on snapshots");

        // created_at should be reverted back to last_updated.
        let created_at_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.columns
             WHERE table_name = 'snapshots' AND column_name = 'created_at'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(created_at_count, 0, "created_at should be gone after rollback");

        let last_updated_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.columns
             WHERE table_name = 'snapshots' AND column_name = 'last_updated'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(last_updated_count, 1, "last_updated should be restored after rollback");

        // doc_id on snapshots should be repopulated and non-empty.
        let snapshot_doc_id: String = sqlx::query_scalar(
            "SELECT doc_id FROM snapshots
             WHERE for_ref = $1
             LIMIT 1",
        )
        .bind(ref_id)
        .fetch_one(&pool)
        .await
        .unwrap();

        assert!(
            !snapshot_doc_id.is_empty(),
            "snapshot doc_id should be populated after rollback"
        );

        // heads column should be gone from snapshots.
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.columns
             WHERE table_name = 'snapshots' AND column_name = 'heads'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count, 0, "heads should be gone after rollback");
    }

    // ── get_ref_stubs removal test ──

    #[sqlx::test]
    async fn test_migration_drops_get_ref_stubs(pool: PgPool) {
        run_migrations(&pool).await;

        // The function should no longer exist.
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.routines
             WHERE routine_name = 'get_ref_stubs'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(count, 0, "get_ref_stubs should be dropped");
    }
}
