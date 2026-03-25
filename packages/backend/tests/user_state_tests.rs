//! Integration tests for user state synchronization.
//!
//! These tests require a running PostgreSQL database and exercise the full
//! RPC-level user state update path (document CRUD, permission changes,
//! profile updates → Automerge user state doc).
#[cfg(feature = "integration-tests")]
mod integration_tests {

    use backend::app::AppError;
    use sqlx::PgPool;
    use sqlx_migrator::migrator::{Migrate, Migrator};
    use sqlx_migrator::{Info, Plan};
    use uuid::Uuid;

    /// Run migrations on a test database pool.
    async fn run_migrations(pool: &PgPool) -> Result<(), sqlx::Error> {
        let mut conn = pool.acquire().await?;
        let mut migrator = Migrator::<sqlx::Postgres>::default();
        migrator
            .add_migrations(migrator::migrations())
            .expect("Failed to load migrations");

        let plan = Plan::apply_all();
        migrator.run(&mut *conn, &plan).await.expect("Failed to run migrations");
        Ok(())
    }

    pub async fn ensure_user_exists(pool: &PgPool, user_id: &str) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            INSERT INTO users (id, created, signed_in)
            VALUES ($1, NOW(), NOW())
            ON CONFLICT (id) DO NOTHING
            "#,
            user_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    use autosurgeon::hydrate;
    use backend::app::{AppCtx, AppState};
    use backend::auth::{NewPermissions, PermissionLevel};
    use backend::document;
    use backend::user_state::{DocInfoType, UserState};
    use firebase_auth::FirebaseUser;
    use serde_json::json;
    use std::collections::{HashMap, HashSet};
    use std::sync::Arc;
    use tokio::sync::RwLock;

    async fn create_test_app_state(pool: PgPool) -> AppState {
        let storage = backend::storage::PostgresStorage::new(pool.clone());
        let repo = samod::Repo::builder(tokio::runtime::Handle::current())
            .with_storage(storage)
            .with_announce_policy(|_doc_id, _peer_id| false)
            .load()
            .await;

        AppState {
            db: pool,
            repo,
            active_listeners: Arc::new(RwLock::new(HashSet::new())),
            initialized_user_states: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Helper to read user state from samod using the stored document ID.
    async fn read_user_state_from_samod(state: &AppState, user_id: &str) -> Option<UserState> {
        let doc_id = backend::user_state::get_user_state_doc(state, user_id).await?;

        let doc_handle = match state.repo.find(doc_id.clone()).await {
            Ok(Some(handle)) => handle,
            Ok(None) => return None,
            Err(_) => return None,
        };

        doc_handle.with_document(|doc| hydrate(doc)).ok()
    }

    fn create_test_firebase_user(user_id: &str) -> FirebaseUser {
        serde_json::from_value(json!({
            "iss": "test",
            "aud": "test",
            "sub": user_id,
            "iat": 0,
            "exp": u64::MAX,
            "auth_time": 0,
            "user_id": user_id,
            "firebase": {
                "sign_in_provider": "test",
                "identities": {}
            }
        }))
        .expect("Failed to create test FirebaseUser")
    }

    fn create_test_document_content(name: &str) -> serde_json::Value {
        create_model_document_content(name, "test-theory")
    }

    fn create_model_document_content(name: &str, theory: &str) -> serde_json::Value {
        json!({
            "version": "1",
            "type": "model",
            "name": name,
            "theory": theory,
            "notebook": {
                "cellOrder": [],
                "cellContents": {}
            }
        })
    }

    /// Creates document content for a child document (diagram) that links to a parent ref.
    fn create_child_document_content(name: &str, parent_ref_id: Uuid) -> serde_json::Value {
        json!({
            "version": "1",
            "type": "diagram",
            "name": name,
            "diagramIn": {
                "_id": parent_ref_id.to_string(),
                "_version": null,
                "_server": "test",
                "type": "diagram-in"
            },
            "notebook": {
                "cellOrder": [],
                "cellContents": {}
            }
        })
    }

    // -----------------------------------------------------------------------
    // Document creation
    // -----------------------------------------------------------------------

    /// Creating a new document should upsert it into the creator's user state.
    #[sqlx::test]
    async fn new_ref_updates_user_state(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        backend::user_state::get_or_create_user_state_doc(&state, &user_id)
            .await
            .expect("Failed to initialize user state");

        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&user_id)),
        };
        let content = create_test_document_content("Test Document");
        let ref_id = document::new_ref(ctx, content).await.expect("Failed to create ref");

        let user_state = read_user_state_from_samod(&state, &user_id)
            .await
            .expect("User state should exist");
        assert_eq!(user_state.documents.len(), 1, "Should have one document");
        let doc = user_state.documents.get(&ref_id.to_string()).expect("Document should exist");
        assert_eq!(doc.name.as_str(), "Test Document");
        assert_eq!(doc.type_name, DocInfoType::Model);
        assert_eq!(doc.theory.as_deref(), Some("test-theory"));
        assert!(
            doc.permissions
                .iter()
                .any(|p| p.level == PermissionLevel::Own && p.user.as_deref() == Some(&user_id)),
            "User should have Own permission"
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Soft-delete & restore
    // -----------------------------------------------------------------------

    /// Soft-deleting a document should set `deleted_at` in the user's state doc.
    #[sqlx::test]
    async fn delete_ref_updates_user_state(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        backend::user_state::get_or_create_user_state_doc(&state, &user_id)
            .await
            .expect("Failed to initialize user state");

        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&user_id)),
        };
        let content = create_test_document_content("Document to Delete");
        let ref_id = document::new_ref(ctx, content).await.expect("Failed to create ref");

        let before = read_user_state_from_samod(&state, &user_id).await.unwrap();
        assert!(before.documents.contains_key(&ref_id.to_string()));

        document::delete_ref(state.clone(), ref_id).await.expect("Failed to delete ref");

        let after = read_user_state_from_samod(&state, &user_id).await.unwrap();
        let doc = after.documents.get(&ref_id.to_string()).expect("Document should still exist");
        assert!(doc.deleted_at.is_some(), "deleted_at should be set");

        Ok(())
    }

    /// Restoring a soft-deleted document should clear `deleted_at`.
    #[sqlx::test]
    async fn restore_ref_updates_user_state(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        backend::user_state::get_or_create_user_state_doc(&state, &user_id)
            .await
            .expect("Failed to initialize user state");

        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&user_id)),
        };
        let content = create_test_document_content("Document to Restore");
        let ref_id = document::new_ref(ctx, content).await.expect("Failed to create ref");

        document::delete_ref(state.clone(), ref_id).await.expect("Failed to delete ref");
        let after_delete = read_user_state_from_samod(&state, &user_id).await.unwrap();
        assert!(after_delete.documents.get(&ref_id.to_string()).unwrap().deleted_at.is_some());

        document::restore_ref(state.clone(), ref_id)
            .await
            .expect("Failed to restore ref");
        let after_restore = read_user_state_from_samod(&state, &user_id).await.unwrap();
        assert!(after_restore.documents.get(&ref_id.to_string()).unwrap().deleted_at.is_none());

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Permissions
    // -----------------------------------------------------------------------

    /// Granting permissions to another user should upsert the doc into their state.
    #[sqlx::test]
    async fn set_permissions_updates_user_state(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let owner_id = format!("test_owner_{}", Uuid::now_v7());
        let reader_id = format!("test_reader_{}", Uuid::now_v7());

        ensure_user_exists(&pool, &owner_id).await.expect("Failed to create owner");
        ensure_user_exists(&pool, &reader_id).await.expect("Failed to create reader");

        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&owner_id)),
        };
        let content = create_test_document_content("Shared Document");
        let ref_id = document::new_ref(ctx, content).await.expect("Failed to create ref");

        backend::user_state::get_or_create_user_state_doc(&state, &reader_id)
            .await
            .expect("Failed to initialize reader user state");

        let mut users = HashMap::new();
        users.insert(reader_id.clone(), PermissionLevel::Read);
        backend::auth::set_permissions(&state, ref_id, NewPermissions { anyone: None, users })
            .await
            .expect("Failed to set permissions");

        let reader_state = read_user_state_from_samod(&state, &reader_id)
            .await
            .expect("Reader state missing");
        assert_eq!(reader_state.documents.len(), 1);
        let doc = reader_state.documents.get(&ref_id.to_string()).unwrap();
        assert!(
            doc.permissions
                .iter()
                .any(|p| p.level == PermissionLevel::Read && p.user.as_deref() == Some(&reader_id))
        );

        Ok(())
    }

    /// Granting permissions to multiple users at once should update all of them.
    #[sqlx::test]
    async fn set_permissions_updates_multiple_users(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let owner_id = format!("test_owner_{}", Uuid::now_v7());
        let user1_id = format!("test_user1_{}", Uuid::now_v7());
        let user2_id = format!("test_user2_{}", Uuid::now_v7());

        ensure_user_exists(&pool, &owner_id).await.expect("Failed to create owner");
        ensure_user_exists(&pool, &user1_id).await.expect("Failed to create user1");
        ensure_user_exists(&pool, &user2_id).await.expect("Failed to create user2");

        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&owner_id)),
        };
        let content = create_test_document_content("Multi-user Document");
        let ref_id = document::new_ref(ctx, content).await.expect("Failed to create ref");

        backend::user_state::get_or_create_user_state_doc(&state, &user1_id)
            .await
            .expect("Failed to initialize user1 state");
        backend::user_state::get_or_create_user_state_doc(&state, &user2_id)
            .await
            .expect("Failed to initialize user2 state");

        let mut users = HashMap::new();
        users.insert(user1_id.clone(), PermissionLevel::Write);
        users.insert(user2_id.clone(), PermissionLevel::Read);
        backend::auth::set_permissions(&state, ref_id, NewPermissions { anyone: None, users })
            .await
            .expect("Failed to set permissions");

        let s1 = read_user_state_from_samod(&state, &user1_id).await.unwrap();
        let s2 = read_user_state_from_samod(&state, &user2_id).await.unwrap();

        assert_eq!(s1.documents.len(), 1);
        assert!(
            s1.documents[&ref_id.to_string()]
                .permissions
                .iter()
                .any(|p| p.level == PermissionLevel::Write && p.user.as_deref() == Some(&user1_id))
        );

        assert_eq!(s2.documents.len(), 1);
        assert!(
            s2.documents[&ref_id.to_string()]
                .permissions
                .iter()
                .any(|p| p.level == PermissionLevel::Read && p.user.as_deref() == Some(&user2_id))
        );

        Ok(())
    }

    /// Revoking a permission should remove the document from the user's state.
    #[sqlx::test]
    async fn revoke_permission_removes_document_from_user_state(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let owner_id = format!("test_owner_{}", Uuid::now_v7());
        let user_id = format!("test_user_{}", Uuid::now_v7());

        ensure_user_exists(&pool, &owner_id).await.expect("Failed to create owner");
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&owner_id)),
        };
        let content = create_test_document_content("Revoke Test Document");
        let ref_id = document::new_ref(ctx, content).await.expect("Failed to create ref");

        backend::user_state::get_or_create_user_state_doc(&state, &user_id)
            .await
            .expect("Failed to initialize user state");

        // Grant
        let mut users = HashMap::new();
        users.insert(user_id.clone(), PermissionLevel::Write);
        backend::auth::set_permissions(&state, ref_id, NewPermissions { anyone: None, users })
            .await
            .expect("Failed to grant permissions");
        assert_eq!(read_user_state_from_samod(&state, &user_id).await.unwrap().documents.len(), 1);

        // Revoke
        backend::auth::set_permissions(
            &state,
            ref_id,
            NewPermissions { anyone: None, users: HashMap::new() },
        )
        .await
        .expect("Failed to revoke permissions");

        let after = read_user_state_from_samod(&state, &user_id).await.unwrap();
        assert!(
            !after.documents.contains_key(&ref_id.to_string()),
            "Document should be removed after revocation"
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Autosave
    // -----------------------------------------------------------------------

    /// Autosaving with a changed name should update the user state doc directly.
    #[sqlx::test]
    async fn autosave_updates_user_state(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        backend::user_state::get_or_create_user_state_doc(&state, &user_id)
            .await
            .expect("Failed to initialize user state");

        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&user_id)),
        };
        let content = create_test_document_content("Original Name");
        let ref_id = document::new_ref(ctx, content).await.expect("Failed to create ref");

        let before = read_user_state_from_samod(&state, &user_id).await.unwrap();
        assert_eq!(before.documents[&ref_id.to_string()].name.as_str(), "Original Name");

        let updated = create_test_document_content("Updated Name");
        document::autosave(state.clone(), ref_id, updated, &[])
            .await
            .expect("Failed to autosave");

        let after = read_user_state_from_samod(&state, &user_id).await.unwrap();
        assert_eq!(after.documents[&ref_id.to_string()].name.as_str(), "Updated Name");

        Ok(())
    }

    /// The theory field should be populated on creation and updated via autosave.
    #[sqlx::test]
    async fn theory_field_populated_and_updated(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        backend::user_state::get_or_create_user_state_doc(&state, &user_id)
            .await
            .expect("Failed to initialize user state");

        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&user_id)),
        };

        // Model with theory
        let content = create_model_document_content("Theory Test", "causal-loop");
        let ref_id = document::new_ref(ctx.clone(), content).await.expect("Failed to create ref");

        let s = read_user_state_from_samod(&state, &user_id).await.unwrap();
        let doc = &s.documents[&ref_id.to_string()];
        assert_eq!(doc.type_name, DocInfoType::Model);
        assert_eq!(doc.theory.as_deref(), Some("causal-loop"));

        // Diagram (no theory)
        let diagram_content = create_child_document_content("Test Diagram", ref_id);
        let diagram_id =
            document::new_ref(ctx, diagram_content).await.expect("Failed to create diagram");

        let s = read_user_state_from_samod(&state, &user_id).await.unwrap();
        assert_eq!(s.documents[&diagram_id.to_string()].type_name, DocInfoType::Diagram);
        assert_eq!(s.documents[&diagram_id.to_string()].theory, None);

        // Update theory via autosave
        let updated = create_model_document_content("Theory Test", "petri-net");
        document::autosave(state.clone(), ref_id, updated, &[])
            .await
            .expect("Failed to autosave");

        let s = read_user_state_from_samod(&state, &user_id).await.unwrap();
        assert_eq!(s.documents[&ref_id.to_string()].theory.as_deref(), Some("petri-net"));

        Ok(())
    }

    /// Autosave should update user state docs for multiple owners.
    #[sqlx::test]
    async fn autosave_updates_multiple_owners(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let owner1_id = format!("test_owner1_{}", Uuid::now_v7());
        let owner2_id = format!("test_owner2_{}", Uuid::now_v7());

        ensure_user_exists(&pool, &owner1_id).await.expect("Failed to create owner1");
        ensure_user_exists(&pool, &owner2_id).await.expect("Failed to create owner2");

        backend::user_state::get_or_create_user_state_doc(&state, &owner1_id)
            .await
            .expect("Failed to initialize owner1 state");

        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&owner1_id)),
        };
        let content = create_test_document_content("Multi-Owner Document");
        let ref_id = document::new_ref(ctx, content).await.expect("Failed to create ref");

        // Directly insert a second owner (bypasses set_permissions).
        sqlx::query!(
            "INSERT INTO permissions (subject, object, level) VALUES ($1, $2, 'own')",
            owner2_id,
            ref_id
        )
        .execute(&pool)
        .await?;

        backend::user_state::get_or_create_user_state_doc(&state, &owner2_id)
            .await
            .expect("Failed to initialize owner2 state");

        let updated = create_test_document_content("Updated by Autosave");
        document::autosave(state.clone(), ref_id, updated, &[])
            .await
            .expect("Failed to autosave");

        let s1 = read_user_state_from_samod(&state, &owner1_id).await.unwrap();
        let s2 = read_user_state_from_samod(&state, &owner2_id).await.unwrap();

        assert_eq!(s1.documents[&ref_id.to_string()].name.as_str(), "Updated by Autosave");
        assert_eq!(s2.documents[&ref_id.to_string()].name.as_str(), "Updated by Autosave");

        assert!(
            s1.documents[&ref_id.to_string()]
                .permissions
                .iter()
                .any(|p| p.level == PermissionLevel::Own && p.user.as_deref() == Some(&owner1_id))
        );
        assert!(
            s2.documents[&ref_id.to_string()]
                .permissions
                .iter()
                .any(|p| p.level == PermissionLevel::Own && p.user.as_deref() == Some(&owner2_id))
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // get_or_create_user_state_doc
    // -----------------------------------------------------------------------

    /// Calling `get_or_create_user_state_doc` should populate the doc from the DB.
    #[sqlx::test]
    async fn get_or_create_user_state_doc_initializes_from_db(pool: PgPool) -> sqlx::Result<()> {
        use backend::user_state::get_or_create_user_state_doc;

        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&user_id)),
        };
        let content = create_test_document_content("Init Test Document");
        let ref_id = document::new_ref(ctx, content).await.expect("Failed to create ref");

        let _doc_id = get_or_create_user_state_doc(&state, &user_id)
            .await
            .expect("Failed to get or create user state doc");

        let persisted = sqlx::query_scalar::<_, String>(
            "SELECT state_doc_id FROM users WHERE id = $1 AND state_doc_id IS NOT NULL",
        )
        .bind(&user_id)
        .fetch_optional(&pool)
        .await?
        .expect("state_doc_id should be persisted");
        assert!(!persisted.is_empty());

        let us = read_user_state_from_samod(&state, &user_id).await.unwrap();
        assert_eq!(us.documents.len(), 1);
        assert_eq!(us.documents[&ref_id.to_string()].name.as_str(), "Init Test Document");

        Ok(())
    }

    /// A new user with no documents should get an empty state doc.
    #[sqlx::test]
    async fn get_or_create_user_state_doc_empty_for_new_user(pool: PgPool) -> sqlx::Result<()> {
        use backend::user_state::get_or_create_user_state_doc;

        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        get_or_create_user_state_doc(&state, &user_id).await.unwrap();

        let us = read_user_state_from_samod(&state, &user_id).await.unwrap();
        assert_eq!(us.documents.len(), 0);

        Ok(())
    }

    /// A second call should return the same document ID (cached).
    #[sqlx::test]
    async fn get_or_create_user_state_doc_returns_cached(pool: PgPool) -> sqlx::Result<()> {
        use backend::user_state::get_or_create_user_state_doc;

        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        let id1 = get_or_create_user_state_doc(&state, &user_id).await.unwrap();
        let id2 = get_or_create_user_state_doc(&state, &user_id).await.unwrap();
        assert_eq!(id1, id2);

        Ok(())
    }

    /// The document ID should survive an app restart (persisted in the DB).
    #[sqlx::test]
    async fn get_or_create_user_state_doc_persists_across_app_restart(
        pool: PgPool,
    ) -> sqlx::Result<()> {
        use backend::user_state::get_or_create_user_state_doc;

        run_migrations(&pool).await?;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        let id_before = {
            let state = create_test_app_state(pool.clone()).await;
            let id = get_or_create_user_state_doc(&state, &user_id).await.unwrap();
            state.repo.stop().await;
            id
        };

        let state2 = create_test_app_state(pool.clone()).await;
        let id_after = backend::user_state::get_or_create_user_state_doc(&state2, &user_id)
            .await
            .unwrap();
        assert_eq!(id_before, id_after);

        Ok(())
    }

    /// The first read after restart should refresh stale doc contents from DB.
    #[sqlx::test]
    async fn get_or_create_user_state_doc_refreshes_on_first_read_after_restart(
        pool: PgPool,
    ) -> sqlx::Result<()> {
        use backend::user_state::get_or_create_user_state_doc;

        run_migrations(&pool).await?;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        {
            let state = create_test_app_state(pool.clone()).await;
            get_or_create_user_state_doc(&state, &user_id).await.unwrap();

            // Create a ref after the state doc exists — the doc will be stale
            // after restart because the process-local cache is lost.
            let ctx = AppCtx {
                state: state.clone(),
                user: Some(create_test_firebase_user(&user_id)),
            };
            let _ =
                document::new_ref(ctx, create_test_document_content("Restart Refresh Document"))
                    .await
                    .unwrap();
            state.repo.stop().await;
        }

        let state2 = create_test_app_state(pool.clone()).await;
        get_or_create_user_state_doc(&state2, &user_id).await.unwrap();

        let us = read_user_state_from_samod(&state2, &user_id).await.unwrap();
        assert_eq!(us.documents.len(), 1);
        assert!(us.documents.values().any(|d| d.name.as_str() == "Restart Refresh Document"));

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Relations (parent/child)
    // -----------------------------------------------------------------------

    /// Relation entries should be populated correctly on initial DB load.
    #[sqlx::test]
    async fn parent_child_populated_on_db_load(pool: PgPool) -> sqlx::Result<()> {
        use backend::user_state::get_or_create_user_state_doc;

        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&user_id)),
        };

        let parent_id = document::new_ref(ctx.clone(), create_test_document_content("Parent Doc"))
            .await
            .unwrap();
        let child_id =
            document::new_ref(ctx, create_child_document_content("Child Doc", parent_id))
                .await
                .unwrap();

        get_or_create_user_state_doc(&state, &user_id).await.unwrap();

        let us = read_user_state_from_samod(&state, &user_id).await.unwrap();
        assert_eq!(us.documents.len(), 2);

        let parent = &us.documents[&parent_id.to_string()];
        let child = &us.documents[&child_id.to_string()];

        assert!(parent.depends_on.is_empty());
        assert_eq!(child.depends_on.len(), 1);
        assert_eq!(child.depends_on[0].ref_id, parent_id);
        assert_eq!(child.depends_on[0].relation_type, "diagram-in");

        assert_eq!(parent.used_by.len(), 1);
        assert_eq!(parent.used_by[0].ref_id, child_id);
        assert!(child.used_by.is_empty());

        Ok(())
    }

    /// Relations should stay consistent when documents are created via RPC
    /// with the user state doc already initialized.
    #[sqlx::test]
    async fn parent_child_consistent_after_rpc_updates(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        backend::user_state::get_or_create_user_state_doc(&state, &user_id)
            .await
            .expect("Failed to initialize user state");

        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&user_id)),
        };

        let parent_id = document::new_ref(ctx.clone(), create_test_document_content("Parent Doc"))
            .await
            .unwrap();
        let child_id =
            document::new_ref(ctx, create_child_document_content("Child Doc", parent_id))
                .await
                .unwrap();

        let us = read_user_state_from_samod(&state, &user_id).await.unwrap();
        assert_eq!(us.documents.len(), 2);

        let parent = &us.documents[&parent_id.to_string()];
        let child = &us.documents[&child_id.to_string()];

        assert!(parent.depends_on.is_empty());
        assert_eq!(child.depends_on.len(), 1);
        assert_eq!(child.depends_on[0].ref_id, parent_id);
        assert_eq!(parent.used_by.len(), 1);
        assert_eq!(parent.used_by[0].ref_id, child_id);
        assert!(child.used_by.is_empty());

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Profile updates
    // -----------------------------------------------------------------------

    /// Updating a user's display name should propagate to all state docs.
    #[sqlx::test]
    async fn profile_update_propagates_to_user_state(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let owner_id = format!("test_owner_{}", Uuid::now_v7());
        let reader_id = format!("test_reader_{}", Uuid::now_v7());

        ensure_user_exists(&pool, &owner_id).await.expect("Failed to create owner");
        ensure_user_exists(&pool, &reader_id).await.expect("Failed to create reader");

        let owner_ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&owner_id)),
        };

        backend::user::set_active_user_profile(
            owner_ctx.clone(),
            backend::user::UserProfile {
                username: None,
                display_name: Some("Original Name".into()),
            },
        )
        .await
        .expect("Failed to set owner profile");

        let content = create_test_document_content("Shared Document");
        let ref_id = document::new_ref(owner_ctx.clone(), content).await.unwrap();

        let mut users = HashMap::new();
        users.insert(reader_id.clone(), PermissionLevel::Read);
        backend::auth::set_permissions(&state, ref_id, NewPermissions { anyone: None, users })
            .await
            .unwrap();

        backend::user_state::get_or_create_user_state_doc(&state, &reader_id)
            .await
            .unwrap();
        backend::user_state::get_or_create_user_state_doc(&state, &owner_id)
            .await
            .unwrap();

        // Before update
        let reader_before = read_user_state_from_samod(&state, &reader_id).await.unwrap();
        assert_eq!(
            reader_before
                .known_users
                .get(&owner_id)
                .and_then(|u| u.display_name.as_ref())
                .map(|t| t.as_str()),
            Some("Original Name"),
        );

        let owner_before = read_user_state_from_samod(&state, &owner_id).await.unwrap();
        assert_eq!(
            owner_before.profile.display_name.as_ref().map(|t| t.as_str()),
            Some("Original Name")
        );

        // Update profile
        backend::user::set_active_user_profile(
            owner_ctx,
            backend::user::UserProfile {
                username: None,
                display_name: Some("Updated Name".into()),
            },
        )
        .await
        .unwrap();

        // After update
        let reader_after = read_user_state_from_samod(&state, &reader_id).await.unwrap();
        assert_eq!(
            reader_after
                .known_users
                .get(&owner_id)
                .and_then(|u| u.display_name.as_ref())
                .map(|t| t.as_str()),
            Some("Updated Name"),
        );

        let owner_after = read_user_state_from_samod(&state, &owner_id).await.unwrap();
        assert_eq!(
            owner_after.profile.display_name.as_ref().map(|t| t.as_str()),
            Some("Updated Name")
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Property tests (require DB)
    // -----------------------------------------------------------------------

    #[cfg(feature = "property-tests")]
    mod property_tests {
        use super::*;
        use backend::app::AppError;
        use backend::auth::PermissionLevel;
        use backend::user_state::arbitrary::arbitrary_user_state_with_id;
        use backend::user_state::{UserState, read_user_state_from_db};
        use sqlx::PgPool;
        use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
        use std::str::FromStr;
        use test_strategy::proptest;
        use uuid::Uuid;

        /// An isolated temporary Postgres database for a single test iteration.
        struct TestDb {
            pool: PgPool,
            db_name: String,
            master_url: String,
        }

        impl TestDb {
            async fn new() -> Self {
                let master_url =
                    dotenvy::var("DATABASE_URL").expect("DATABASE_URL must be set for tests");

                let master_pool = PgPoolOptions::new()
                    .max_connections(2)
                    .connect(&master_url)
                    .await
                    .expect("Failed to connect to master database");

                let db_name = format!("_proptest_{}", Uuid::now_v7().simple());

                sqlx::query(&format!("CREATE DATABASE \"{db_name}\""))
                    .execute(&master_pool)
                    .await
                    .unwrap_or_else(|e| panic!("Failed to create test database {db_name}: {e}"));

                master_pool.close().await;

                let connect_opts = PgConnectOptions::from_str(&master_url)
                    .expect("Failed to parse DATABASE_URL")
                    .database(&db_name);
                let pool = PgPoolOptions::new()
                    .max_connections(5)
                    .connect_with(connect_opts)
                    .await
                    .expect("Failed to connect to test database");

                run_migrations(&pool).await.expect("Failed to run migrations on test database");

                TestDb { pool, db_name, master_url }
            }

            fn pool(&self) -> &PgPool {
                &self.pool
            }

            async fn cleanup(self) {
                self.pool.close().await;

                let master_pool = PgPoolOptions::new()
                    .max_connections(2)
                    .connect(&self.master_url)
                    .await
                    .expect("Failed to connect to master database for cleanup");

                sqlx::query(&format!("DROP DATABASE IF EXISTS \"{}\" WITH (FORCE)", self.db_name))
                    .execute(&master_pool)
                    .await
                    .unwrap_or_else(|e| {
                        panic!("Failed to drop test database {}: {e}", self.db_name)
                    });

                master_pool.close().await;
            }
        }

        /// Write a `UserState` to the database (test helper).
        async fn write_user_state_to_db(
            user_id: String,
            db: &PgPool,
            state: &UserState,
        ) -> Result<(), AppError> {
            sqlx::query!(
                r#"
                INSERT INTO users (id, created, signed_in, username, display_name)
                VALUES ($1, NOW(), NOW(), $2, $3)
                ON CONFLICT (id) DO UPDATE SET username = COALESCE($2, users.username), display_name = $3
                "#,
                user_id,
                state.profile.username.as_ref().map(|u| u.as_str()),
                state.profile.display_name.as_ref().map(|d| d.as_str()),
            )
            .execute(db)
            .await?;

            for (ref_id_str, doc) in &state.documents {
                let ref_id: Uuid = ref_id_str.parse().expect("Invalid UUID key");

                for perm in &doc.permissions {
                    if let Some(user_id) = &perm.user {
                        let user_info = state.known_users.get(user_id);
                        sqlx::query!(
                            r#"
                            INSERT INTO users (id, created, signed_in, username, display_name)
                            VALUES ($1, NOW(), NOW(), $2, $3)
                            ON CONFLICT (id) DO NOTHING
                            "#,
                            user_id.as_str(),
                            user_info.and_then(|u| u.username.as_ref()).map(|u| u.as_str()),
                            user_info.and_then(|u| u.display_name.as_ref()).map(|d| d.as_str())
                        )
                        .execute(db)
                        .await?;
                    }
                }

                let mut content = serde_json::json!({
                    "name": doc.name.as_str(),
                    "type": doc.type_name.to_string()
                });
                if let Some(theory) = &doc.theory {
                    content["theory"] = serde_json::Value::String(theory.clone());
                }

                sqlx::query!(
                    r#"
                    WITH snapshot AS (
                        INSERT INTO snapshots (for_ref, content, last_updated, heads)
                        VALUES ($1, $2, $3, $4)
                        RETURNING id
                    )
                    INSERT INTO refs (id, head, created, doc_id)
                    VALUES ($1, (SELECT id FROM snapshot), $3, $5)
                    ON CONFLICT (id) DO UPDATE SET head = (SELECT id FROM snapshot)
                    "#,
                    ref_id,
                    content,
                    doc.created_at,
                    &[] as &[String],
                    format!("test_fake_automerge_doc_{ref_id}")
                )
                .execute(db)
                .await?;

                if let Some(deleted_at) = doc.deleted_at {
                    sqlx::query!(
                        r#"
                        UPDATE refs SET deleted_at = $2 WHERE id = $1
                        "#,
                        ref_id,
                        deleted_at
                    )
                    .execute(db)
                    .await?;
                }

                for perm in &doc.permissions {
                    let subject = perm.user.as_deref();
                    sqlx::query!(
                        r#"
                        INSERT INTO permissions (subject, object, level)
                        VALUES ($1, $2, $3)
                        ON CONFLICT (subject, object) DO UPDATE SET level = $3
                        "#,
                        subject,
                        ref_id,
                        perm.level as PermissionLevel
                    )
                    .execute(db)
                    .await?;
                }
            }

            Ok(())
        }

        /// Write→read roundtrip through the database.
        #[proptest(async = "tokio", cases = 32)]
        async fn user_state_db_roundtrip(
            #[strategy(arbitrary_user_state_with_id())] user_id_and_state: (String, UserState),
        ) {
            let (user_id, input_state) = user_id_and_state;
            let test_db = TestDb::new().await;

            write_user_state_to_db(user_id.clone(), test_db.pool(), &input_state)
                .await
                .expect("Failed to write user state");

            let output_state = read_user_state_from_db(user_id.clone(), test_db.pool())
                .await
                .expect("Failed to read user state");

            test_db.cleanup().await;

            proptest::prop_assert_eq!(input_state, output_state);
        }

        /// `get_or_create_user_state_doc` should initialize the Automerge doc
        /// from DB state.
        #[proptest(async = "tokio", cases = 32)]
        async fn get_or_create_initializes_automerge_from_db(
            #[strategy(arbitrary_user_state_with_id())] user_id_and_state: (String, UserState),
        ) {
            use autosurgeon::hydrate;
            use backend::app::AppState;
            use backend::storage::PostgresStorage;
            use std::collections::{HashMap, HashSet};
            use std::sync::Arc;
            use tokio::sync::RwLock;

            let (user_id, input_state) = user_id_and_state;
            let test_db = TestDb::new().await;

            let storage = PostgresStorage::new(test_db.pool().clone());
            let repo = samod::Repo::builder(tokio::runtime::Handle::current())
                .with_storage(storage)
                .with_announce_policy(|_doc_id, _peer_id| false)
                .load()
                .await;

            let state = AppState {
                db: test_db.pool().clone(),
                repo,
                active_listeners: Arc::new(RwLock::new(HashSet::new())),
                initialized_user_states: Arc::new(RwLock::new(HashMap::new())),
            };

            write_user_state_to_db(user_id.clone(), test_db.pool(), &input_state)
                .await
                .expect("Failed to write user state");

            if !input_state.documents.is_empty() {
                backend::user_state::get_or_create_user_state_doc(&state, &user_id)
                    .await
                    .expect("Failed to initialize user state");
            }

            let automerge_state: Option<UserState> = {
                let doc_id = backend::user_state::get_user_state_doc(&state, &user_id).await;
                match doc_id {
                    Some(doc_id) => {
                        let handle = state.repo.find(doc_id).await.ok().flatten();
                        handle.and_then(|h| h.with_document(|doc| hydrate(doc)).ok())
                    }
                    None => None,
                }
            };

            test_db.cleanup().await;

            if input_state.documents.is_empty() {
                proptest::prop_assert!(automerge_state.is_none());
            } else {
                proptest::prop_assert_eq!(Some(input_state), automerge_state);
            }
        }
    }
}
