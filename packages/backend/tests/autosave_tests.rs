//! Integration tests for autosave behavior.
//!
//! These tests require a running PostgreSQL database and exercise the
//! autosave listener end-to-end.
#[cfg(feature = "integration-tests")]
mod common;

#[cfg(feature = "integration-tests")]
mod integration_tests {
    use crate::common::test_utils::{
        create_test_app_state, create_test_document_content, create_test_firebase_user,
        ensure_user_exists, run_migrations,
    };
    use automerge::transaction::Transactable;
    use backend::app::AppCtx;
    use backend::document;
    use sqlx::PgPool;
    use uuid::Uuid;

    /// A document change should create a new snapshot after debounce.
    #[sqlx::test]
    async fn autosave_creates_snapshot_after_settle(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&user_id)),
        };
        let content = create_test_document_content("Autosave Base");
        let ref_id = document::new_ref(ctx, content).await.expect("Failed to create ref");

        let before_snapshot_id: i32 =
            sqlx::query_scalar("SELECT current_snapshot FROM refs WHERE id = $1")
                .bind(ref_id)
                .fetch_one(&pool)
                .await?;

        let doc_id = document::get_doc_id(state.clone(), ref_id)
            .await
            .expect("Failed to read doc id");
        let doc_handle = state
            .repo
            .find(doc_id)
            .await
            .expect("Repo lookup failed")
            .expect("Document not found in repo");

        doc_handle
            .with_document(|doc| {
                doc.transact(|tx| {
                    tx.put(automerge::ROOT, "name", "Autosaved Name")?;
                    Ok::<_, automerge::AutomergeError>(())
                })
                .map(|_| ())
            })
            .expect("Failed to mutate document");

        tokio::time::sleep(std::time::Duration::from_millis(800)).await;

        let after_snapshot_id: i32 =
            sqlx::query_scalar("SELECT current_snapshot FROM refs WHERE id = $1")
                .bind(ref_id)
                .fetch_one(&pool)
                .await?;

        assert_ne!(
            before_snapshot_id, after_snapshot_id,
            "expected debounced autosave to create a new snapshot"
        );

        let snapshot_name: Option<String> =
            sqlx::query_scalar("SELECT content->>'name' FROM snapshots WHERE id = $1")
                .bind(after_snapshot_id)
                .fetch_one(&pool)
                .await?;

        assert_eq!(snapshot_name.as_deref(), Some("Autosaved Name"));

        Ok(())
    }
}
