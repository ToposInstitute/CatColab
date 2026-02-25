//! Integration tests for user state synchronization.
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

        // Run all migrations
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
    use backend::user_state::UserState;
    use backend::user_state_subscription::run_user_state_subscription;
    use firebase_auth::FirebaseUser;
    use serde_json::json;
    use std::collections::{HashMap, HashSet};
    use std::sync::Arc;
    use std::time::Duration;
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
            user_states: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Helper to read user state from samod using the stored document ID.
    async fn read_user_state_from_samod(state: &AppState, user_id: &str) -> Option<UserState> {
        let doc_id = {
            let states = state.user_states.read().await;
            states.get(user_id).cloned()
        };

        let doc_id = match doc_id {
            Some(id) => id,
            None => {
                eprintln!("[read_user_state_from_samod] No document ID found for user {user_id}");
                return None;
            }
        };

        let doc_handle = match state.repo.find(doc_id.clone()).await {
            Ok(Some(handle)) => handle,
            Ok(None) => {
                eprintln!("[read_user_state_from_samod] No document found for doc_id {doc_id}");
                return None;
            }
            Err(e) => {
                eprintln!("[read_user_state_from_samod] Error finding doc {doc_id}: {e}");
                return None;
            }
        };

        match doc_handle.with_document(|doc| hydrate(doc)) {
            Ok(state) => Some(state),
            Err(e) => {
                eprintln!("[read_user_state_from_samod] Failed to hydrate user state: {e}");
                None
            }
        }
    }

    fn create_test_firebase_user(user_id: &str) -> FirebaseUser {
        // FirebaseProvider has private fields, so we need to deserialize it
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
        // Version "1" document structure matching notebook-types v1::Document (model type)
        json!({
            "version": "1",
            "type": "model",
            "name": name,
            "theory": "test-theory",
            "notebook": {
                "cellOrder": [],
                "cellContents": {}
            }
        })
    }

    /// Tests that creating a new document triggers user state subscription updates
    #[sqlx::test]
    async fn new_ref_triggers_subscription_update(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        // Spawn the subscription in a background task (it will create the doc on first notification)
        let state_clone = state.clone();
        let subscription_handle =
            tokio::spawn(async move { run_user_state_subscription(state_clone).await });

        // Give the subscription time to start
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Create a new document using the document module function
        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&user_id)),
        };

        let content = create_test_document_content("Test Document");
        let ref_id = document::new_ref(ctx, content).await.expect("Failed to create ref");

        // Wait for the subscription to process the notification
        tokio::time::sleep(Duration::from_millis(300)).await;

        // Check that the user state was updated
        let user_state = read_user_state_from_samod(&state, &user_id).await;

        subscription_handle.abort();

        let user_state = user_state.expect("User state should exist");
        assert_eq!(user_state.documents.len(), 1, "Should have one document");
        let doc = user_state.documents.get(&ref_id.to_string()).expect("Document should exist");
        assert_eq!(doc.name.as_str(), "Test Document");
        assert!(
            doc.permissions.iter().any(|p| p.level == PermissionLevel::Own
                && p.user.as_ref().map(|u| u.id.as_str()) == Some(&user_id)),
            "User should have Own permission"
        );

        Ok(())
    }

    /// Tests that granting permissions to another user triggers their subscription update
    #[sqlx::test]
    async fn set_permissions_triggers_subscription_update(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let owner_id = format!("test_owner_{}", Uuid::now_v7());
        let reader_id = format!("test_reader_{}", Uuid::now_v7());

        ensure_user_exists(&pool, &owner_id).await.expect("Failed to create owner");
        ensure_user_exists(&pool, &reader_id).await.expect("Failed to create reader");

        // Create a document as owner
        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&owner_id)),
        };
        let content = create_test_document_content("Shared Document");
        let ref_id = document::new_ref(ctx, content).await.expect("Failed to create ref");

        // Spawn the subscription in a background task
        let state_clone = state.clone();
        let subscription_handle =
            tokio::spawn(async move { run_user_state_subscription(state_clone).await });

        tokio::time::sleep(Duration::from_millis(100)).await;

        // Grant read permission to the reader
        let mut users = HashMap::new();
        users.insert(reader_id.clone(), PermissionLevel::Read);
        let new_permissions = NewPermissions { anyone: None, users };

        backend::auth::set_permissions(&state, ref_id, new_permissions)
            .await
            .expect("Failed to set permissions");

        // Wait for the subscription to process
        tokio::time::sleep(Duration::from_millis(300)).await;

        // Check that the reader's state was updated
        let user_state = read_user_state_from_samod(&state, &reader_id).await;

        subscription_handle.abort();

        let user_state = user_state.expect("User state should exist");
        assert_eq!(user_state.documents.len(), 1, "Reader should see one document");
        let doc = user_state.documents.get(&ref_id.to_string()).expect("Document should exist");
        assert!(
            doc.permissions.iter().any(|p| p.level == PermissionLevel::Read
                && p.user.as_ref().map(|u| u.id.as_str()) == Some(&reader_id)),
            "Reader should have Read permission"
        );

        Ok(())
    }

    /// Tests that deleting a document triggers subscription update
    #[sqlx::test]
    async fn delete_ref_triggers_subscription_update(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        // Spawn the subscription in a background task
        let state_clone = state.clone();
        let subscription_handle =
            tokio::spawn(async move { run_user_state_subscription(state_clone).await });

        // Give the subscription time to start
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Create a document (subscription should receive the notification)
        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&user_id)),
        };
        let content = create_test_document_content("Document to Delete");
        let ref_id = document::new_ref(ctx, content).await.expect("Failed to create ref");

        // Wait for subscription to process the create notification
        tokio::time::sleep(Duration::from_millis(300)).await;

        // Verify document exists in user state (check for our specific document, not total count)
        let state_before = read_user_state_from_samod(&state, &user_id).await;
        let doc_exists_before = state_before
            .as_ref()
            .map(|s| s.documents.contains_key(&ref_id.to_string()))
            .unwrap_or(false);
        assert!(doc_exists_before, "Document should exist in user state before delete");

        // Delete the document
        document::delete_ref(state.clone(), ref_id).await.expect("Failed to delete ref");

        // Wait for the subscription to process the delete notification
        tokio::time::sleep(Duration::from_millis(300)).await;

        // Check that the document is still in user state but has deleted_at set
        let user_state = read_user_state_from_samod(&state, &user_id).await;

        subscription_handle.abort();

        let user_state = user_state.expect("User state should exist");
        let doc = user_state
            .documents
            .get(&ref_id.to_string())
            .expect("Document should still exist in user state after soft delete");
        assert!(
            doc.deleted_at.is_some(),
            "Document should have deleted_at set after soft delete"
        );

        Ok(())
    }

    /// Tests that restoring a soft-deleted document triggers subscription update
    #[sqlx::test]
    async fn restore_ref_triggers_subscription_update(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        // Spawn the subscription in a background task
        let state_clone = state.clone();
        let subscription_handle =
            tokio::spawn(async move { run_user_state_subscription(state_clone).await });

        // Give the subscription time to start
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Create a document (subscription should receive the notification)
        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&user_id)),
        };
        let content = create_test_document_content("Document to Restore");
        let ref_id = document::new_ref(ctx, content).await.expect("Failed to create ref");

        // Wait for subscription to process the create notification
        tokio::time::sleep(Duration::from_millis(300)).await;

        // Verify document exists in user state
        let state_after_create = read_user_state_from_samod(&state, &user_id).await;
        let doc_exists_after_create = state_after_create
            .as_ref()
            .map(|s| s.documents.contains_key(&ref_id.to_string()))
            .unwrap_or(false);
        assert!(doc_exists_after_create, "Document should exist after creation");

        // Delete the document
        document::delete_ref(state.clone(), ref_id).await.expect("Failed to delete ref");

        // Wait for the subscription to process the delete notification
        tokio::time::sleep(Duration::from_millis(300)).await;

        // Verify document still exists but has deleted_at set
        let state_after_delete = read_user_state_from_samod(&state, &user_id).await;
        let doc_after_delete =
            state_after_delete.as_ref().and_then(|s| s.documents.get(&ref_id.to_string()));
        assert!(
            doc_after_delete.is_some(),
            "Document should still exist in user state after deletion"
        );
        assert!(
            doc_after_delete.unwrap().deleted_at.is_some(),
            "Document should have deleted_at set after deletion"
        );

        // Restore the document
        document::restore_ref(state.clone(), ref_id)
            .await
            .expect("Failed to restore ref");

        // Wait for the subscription to process the restore notification
        tokio::time::sleep(Duration::from_millis(300)).await;

        // Check that the document is back in user state
        let user_state = read_user_state_from_samod(&state, &user_id).await;

        subscription_handle.abort();

        let user_state = user_state.expect("User state should exist");
        let restored_doc = user_state
            .documents
            .get(&ref_id.to_string())
            .expect("Document should exist in user state after restoration");
        assert!(
            restored_doc.deleted_at.is_none(),
            "Document should have deleted_at cleared after restoration"
        );

        Ok(())
    }

    /// Tests that multiple users are notified when permissions change
    #[sqlx::test]
    async fn multiple_users_notified_on_permission_change(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let owner_id = format!("test_owner_{}", Uuid::now_v7());
        let user1_id = format!("test_user1_{}", Uuid::now_v7());
        let user2_id = format!("test_user2_{}", Uuid::now_v7());

        ensure_user_exists(&pool, &owner_id).await.expect("Failed to create owner");
        ensure_user_exists(&pool, &user1_id).await.expect("Failed to create user1");
        ensure_user_exists(&pool, &user2_id).await.expect("Failed to create user2");

        // Create a document as owner
        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&owner_id)),
        };
        let content = create_test_document_content("Multi-user Document");
        let ref_id = document::new_ref(ctx, content).await.expect("Failed to create ref");

        // Spawn the subscription in a background task
        let state_clone = state.clone();
        let subscription_handle =
            tokio::spawn(async move { run_user_state_subscription(state_clone).await });

        tokio::time::sleep(Duration::from_millis(100)).await;

        // Grant permissions to both users at once
        let mut users = HashMap::new();
        users.insert(user1_id.clone(), PermissionLevel::Write);
        users.insert(user2_id.clone(), PermissionLevel::Read);
        let new_permissions = NewPermissions { anyone: None, users };

        backend::auth::set_permissions(&state, ref_id, new_permissions)
            .await
            .expect("Failed to set permissions");

        // Wait for subscriptions to process
        tokio::time::sleep(Duration::from_millis(300)).await;

        // Check both users' states using the samod helper
        let user1_state = read_user_state_from_samod(&state, &user1_id).await;
        let user2_state = read_user_state_from_samod(&state, &user2_id).await;

        subscription_handle.abort();

        let user1_state = user1_state.expect("User1 state should exist");
        let user2_state = user2_state.expect("User2 state should exist");

        assert_eq!(user1_state.documents.len(), 1, "User1 should see one document");
        let doc1 = user1_state.documents.get(&ref_id.to_string()).expect("Document should exist");
        assert!(
            doc1.permissions.iter().any(|p| p.level == PermissionLevel::Write
                && p.user.as_ref().map(|u| u.id.as_str()) == Some(&user1_id)),
            "User1 should have Write permission"
        );

        assert_eq!(user2_state.documents.len(), 1, "User2 should see one document");
        let doc2 = user2_state.documents.get(&ref_id.to_string()).expect("Document should exist");
        assert!(
            doc2.permissions.iter().any(|p| p.level == PermissionLevel::Read
                && p.user.as_ref().map(|u| u.id.as_str()) == Some(&user2_id)),
            "User2 should have Read permission"
        );

        Ok(())
    }

    /// Tests that revoking permission removes document from affected user's state
    #[sqlx::test]
    async fn revoke_permission_removes_document_from_user_state(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let owner_id = format!("test_owner_{}", Uuid::now_v7());
        let user_id = format!("test_user_{}", Uuid::now_v7());

        ensure_user_exists(&pool, &owner_id).await.expect("Failed to create owner");
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        // Create a document as owner
        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&owner_id)),
        };
        let content = create_test_document_content("Revoke Test Document");
        let ref_id = document::new_ref(ctx, content).await.expect("Failed to create ref");

        // Spawn the subscription in a background task
        let state_clone = state.clone();
        let subscription_handle =
            tokio::spawn(async move { run_user_state_subscription(state_clone).await });

        tokio::time::sleep(Duration::from_millis(100)).await;

        // Grant write permission to user
        let mut users = HashMap::new();
        users.insert(user_id.clone(), PermissionLevel::Write);
        let grant_permissions = NewPermissions { anyone: None, users };

        backend::auth::set_permissions(&state, ref_id, grant_permissions)
            .await
            .expect("Failed to grant permissions");

        // Wait for subscription to process
        tokio::time::sleep(Duration::from_millis(300)).await;

        // Verify user has the document
        let user_state_with_doc = read_user_state_from_samod(&state, &user_id).await;
        let user_state_with_doc = user_state_with_doc.expect("User state should exist");
        assert_eq!(
            user_state_with_doc.documents.len(),
            1,
            "User should see the document after permission grant"
        );

        // Revoke permission by setting empty permissions (owner still has implicit ownership)
        let revoke_permissions = NewPermissions { anyone: None, users: HashMap::new() };

        backend::auth::set_permissions(&state, ref_id, revoke_permissions)
            .await
            .expect("Failed to revoke permissions");

        // Wait for subscription to process
        tokio::time::sleep(Duration::from_millis(300)).await;

        // Check that document is removed from user's state
        let user_state = read_user_state_from_samod(&state, &user_id).await;

        subscription_handle.abort();

        let user_state = user_state.expect("User state should exist");
        assert!(
            !user_state.documents.contains_key(&ref_id.to_string()),
            "Document should be removed from user state after permission revoked"
        );

        Ok(())
    }

    /// Tests that autosaving a document with changed name updates user state
    #[sqlx::test]
    async fn autosave_name_change_triggers_subscription_update(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        // Spawn the subscription in a background task
        let state_clone = state.clone();
        let subscription_handle =
            tokio::spawn(async move { run_user_state_subscription(state_clone).await });

        // Give the subscription time to start
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Create a document
        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&user_id)),
        };
        let content = create_test_document_content("Original Name");
        let ref_id = document::new_ref(ctx, content).await.expect("Failed to create ref");

        // Wait for subscription to process the create notification
        tokio::time::sleep(Duration::from_millis(300)).await;

        // Verify original name
        let state_before = read_user_state_from_samod(&state, &user_id).await;
        let doc_before = state_before.as_ref().and_then(|s| s.documents.get(&ref_id.to_string()));
        assert!(doc_before.is_some(), "Document should exist before name change");
        assert_eq!(doc_before.unwrap().name.as_str(), "Original Name");

        // Update the document name by autosaving with new content
        // This only updates the snapshots table, not the refs table,
        // so it should NOT trigger a notification
        let updated_content = create_test_document_content("Updated Name");
        document::autosave(
            state.clone(),
            backend::document::RefContent { ref_id, content: updated_content },
        )
        .await
        .expect("Failed to autosave");

        // Wait to see if subscription processes any notification (it shouldn't)
        tokio::time::sleep(Duration::from_millis(300)).await;

        // Verify name was updated in user state
        let state_after = read_user_state_from_samod(&state, &user_id).await;

        subscription_handle.abort();

        let state_after = state_after.expect("User state should exist");
        let doc_after = state_after
            .documents
            .get(&ref_id.to_string())
            .expect("Document should exist after name change");
        assert_eq!(
            doc_after.name.as_str(),
            "Updated Name",
            "Document name should be updated in user state"
        );

        Ok(())
    }

    /// Tests that multiple owners are handled correctly in autosave notifications
    /// Each owner should see themselves as the owner in their user state.
    #[sqlx::test]
    async fn multiple_owners_autosave_notification(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let owner1_id = format!("test_owner1_{}", Uuid::now_v7());
        let owner2_id = format!("test_owner2_{}", Uuid::now_v7());

        ensure_user_exists(&pool, &owner1_id).await.expect("Failed to create owner1");
        ensure_user_exists(&pool, &owner2_id).await.expect("Failed to create owner2");

        // Spawn the subscription in a background task
        let state_clone = state.clone();
        let subscription_handle =
            tokio::spawn(async move { run_user_state_subscription(state_clone).await });

        // Give the subscription time to start
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Create a document as owner1
        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&owner1_id)),
        };
        let content = create_test_document_content("Multi-Owner Document");
        let ref_id = document::new_ref(ctx, content).await.expect("Failed to create ref");

        // Wait for subscription to process
        tokio::time::sleep(Duration::from_millis(300)).await;

        // Verify owner1 sees the document with themselves having Own permission
        let owner1_state = read_user_state_from_samod(&state, &owner1_id).await;
        let doc1 = owner1_state.as_ref().and_then(|s| s.documents.get(&ref_id.to_string()));
        assert!(doc1.is_some(), "Owner1 should see the document");
        assert!(
            doc1.unwrap().permissions.iter().any(|p| p.level == PermissionLevel::Own
                && p.user.as_ref().map(|u| u.id.as_str()) == Some(owner1_id.as_str())),
            "Owner1 should have Own permission"
        );

        // Directly insert a second owner into the database (violates application logic)
        // This bypasses set_permissions which would prevent this
        sqlx::query!(
            "INSERT INTO permissions (subject, object, level) VALUES ($1, $2, 'own')",
            owner2_id,
            ref_id
        )
        .execute(&pool)
        .await?;

        // Now autosave the document with a name change
        let updated_content = create_test_document_content("Updated by Autosave");
        document::autosave(
            state.clone(),
            backend::document::RefContent { ref_id, content: updated_content },
        )
        .await
        .expect("Failed to autosave");

        // Wait for subscription to process
        tokio::time::sleep(Duration::from_millis(300)).await;

        // Check both owners' user states
        let owner1_state_after = read_user_state_from_samod(&state, &owner1_id).await;
        let owner2_state_after = read_user_state_from_samod(&state, &owner2_id).await;

        subscription_handle.abort();

        // Both should see the updated name
        let doc1_after = owner1_state_after
            .as_ref()
            .and_then(|s| s.documents.get(&ref_id.to_string()))
            .expect("Owner1 should still see document");
        let doc2_after = owner2_state_after
            .as_ref()
            .and_then(|s| s.documents.get(&ref_id.to_string()))
            .expect("Owner2 should see document");

        assert_eq!(doc1_after.name.as_str(), "Updated by Autosave");
        assert_eq!(doc2_after.name.as_str(), "Updated by Autosave");

        // Both owners should appear in the permissions array
        assert!(
            doc1_after.permissions.iter().any(|p| p.level == PermissionLevel::Own
                && p.user.as_ref().map(|u| u.id.as_str()) == Some(owner1_id.as_str())),
            "Owner1 should have Own permission in doc1's permissions"
        );
        assert!(
            doc2_after.permissions.iter().any(|p| p.level == PermissionLevel::Own
                && p.user.as_ref().map(|u| u.id.as_str()) == Some(owner2_id.as_str())),
            "Owner2 should have Own permission in doc2's permissions"
        );

        Ok(())
    }

    /// Tests that get_or_create_user_state_doc initializes user state from DB
    #[sqlx::test]
    async fn get_or_create_user_state_doc_initializes_from_db(pool: PgPool) -> sqlx::Result<()> {
        use backend::user_state::get_or_create_user_state_doc;

        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        // Create a document for this user (without running the subscription)
        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&user_id)),
        };
        let content = create_test_document_content("Init Test Document");
        let ref_id = document::new_ref(ctx, content).await.expect("Failed to create ref");

        // Now call get_or_create_user_state_doc - it should read from DB and create the doc
        let _doc_id = get_or_create_user_state_doc(&state, &user_id)
            .await
            .expect("Failed to get or create user state doc");

        // Verify the document was created and cached
        {
            let states = state.user_states.read().await;
            assert!(states.contains_key(&user_id), "User state should be cached");
        }

        // Read the user state from the document
        let user_state = read_user_state_from_samod(&state, &user_id).await;

        let user_state = user_state.expect("User state should exist");
        assert_eq!(user_state.documents.len(), 1, "Should have one document");
        let doc = user_state.documents.get(&ref_id.to_string()).expect("Document should exist");
        assert_eq!(doc.name.as_str(), "Init Test Document");

        Ok(())
    }

    /// Tests that get_or_create_user_state_doc returns empty state for new user
    #[sqlx::test]
    async fn get_or_create_user_state_doc_empty_for_new_user(pool: PgPool) -> sqlx::Result<()> {
        use backend::user_state::get_or_create_user_state_doc;

        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        // Call get_or_create_user_state_doc for user with no documents
        get_or_create_user_state_doc(&state, &user_id)
            .await
            .expect("Failed to get or create user state doc");

        // Read the user state from the document
        let user_state = read_user_state_from_samod(&state, &user_id).await;

        let user_state = user_state.expect("User state should exist");
        assert_eq!(user_state.documents.len(), 0, "Should have no documents");

        Ok(())
    }

    /// Tests that get_or_create_user_state_doc returns cached doc on second call
    #[sqlx::test]
    async fn get_or_create_user_state_doc_returns_cached(pool: PgPool) -> sqlx::Result<()> {
        use backend::user_state::get_or_create_user_state_doc;

        run_migrations(&pool).await?;
        let state = create_test_app_state(pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        // First call creates the document
        let doc_id1 = get_or_create_user_state_doc(&state, &user_id)
            .await
            .expect("Failed to get or create user state doc");

        // Second call should return the same document ID
        let doc_id2 = get_or_create_user_state_doc(&state, &user_id)
            .await
            .expect("Failed to get or create user state doc");

        assert_eq!(doc_id1, doc_id2, "Should return same document ID on second call");

        Ok(())
    }

    #[cfg(feature = "property-tests")]
    mod proptest_tests {
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
        ///
        /// On creation, connects to the master database from `DATABASE_URL`,
        /// creates a uniquely-named database, and runs migrations on it.
        /// On drop, the temporary database is asynchronously scheduled for cleanup.
        struct TestDb {
            pool: PgPool,
            db_name: String,
            master_url: String,
        }

        impl TestDb {
            /// Creates a new isolated test database with all migrations applied.
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

                // Connect to the new database
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

            /// Returns a reference to the connection pool for this test database.
            fn pool(&self) -> &PgPool {
                &self.pool
            }

            /// Drops the temporary database. Must be called explicitly since async
            /// cleanup cannot run in a synchronous `Drop` impl.
            async fn cleanup(self) {
                self.pool.close().await;

                let master_pool = PgPoolOptions::new()
                    .max_connections(2)
                    .connect(&self.master_url)
                    .await
                    .expect("Failed to connect to master database for cleanup");

                // Use force to disconnect any lingering connections
                sqlx::query(&format!("DROP DATABASE IF EXISTS \"{}\" WITH (FORCE)", self.db_name))
                    .execute(&master_pool)
                    .await
                    .unwrap_or_else(|e| {
                        panic!("Failed to drop test database {}: {e}", self.db_name)
                    });

                master_pool.close().await;
            }
        }

        /// Writes user state to the database. This is only for testing purposes.
        ///
        /// This function persists a `UserState` by:
        /// 1. Ensuring all owner users exist in the `users` table
        /// 2. Creating refs and their head snapshots
        /// 3. Creating permission entries for the user on each document
        ///
        /// Note: The owner of a document is determined by who has the 'own' permission.
        /// If the doc has an owner specified, that user gets 'own' permission.
        /// The requesting user gets their specified permission level.
        async fn write_user_state_to_db(
            user_id: String,
            db: &PgPool,
            state: &UserState,
        ) -> Result<(), AppError> {
            // Ensure the user exists
            sqlx::query!(
                r#"
            INSERT INTO users (id, created, signed_in)
            VALUES ($1, NOW(), NOW())
            ON CONFLICT (id) DO NOTHING
            "#,
                user_id
            )
            .execute(db)
            .await?;

            for (ref_id_str, doc) in &state.documents {
                let ref_id: Uuid = ref_id_str.parse().expect("Invalid UUID key");

                // Ensure all users referenced in permissions exist
                for perm in &doc.permissions {
                    if let Some(user) = &perm.user {
                        sqlx::query!(
                            r#"
                        INSERT INTO users (id, created, signed_in, username, display_name)
                        VALUES ($1, NOW(), NOW(), $2, $3)
                        ON CONFLICT (id) DO NOTHING
                        "#,
                            user.id.as_str(),
                            user.username.as_ref().map(|u| u.as_str()),
                            user.display_name.as_ref().map(|d| d.as_str())
                        )
                        .execute(db)
                        .await?;
                    }
                }

                // Create the ref and its head snapshot
                // We use a minimal JSON content since RefStub doesn't contain the full document
                let content = serde_json::json!({
                    "name": doc.name.as_str(),
                    "type": doc.type_name.as_str()
                });

                // Upsert: if the ref already exists (e.g. during proptest shrinking),
                // update the snapshot content and ref's head pointer.
                sqlx::query!(
                    r#"
                WITH snapshot AS (
                    INSERT INTO snapshots (for_ref, content, last_updated, doc_id)
                    VALUES ($1, $2, $3, $4)
                    RETURNING id
                )
                INSERT INTO refs (id, head, created)
                VALUES ($1, (SELECT id FROM snapshot), $3)
                ON CONFLICT (id) DO UPDATE SET head = (SELECT id FROM snapshot)
                "#,
                    ref_id,
                    content,
                    doc.created_at,
                    format!("test_fake_automerge_doc_{ref_id}")
                )
                .execute(db)
                .await?;

                // Set deleted_at if the doc is soft-deleted
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

                // Create all permission entries
                for perm in &doc.permissions {
                    let subject = perm.user.as_ref().map(|u| u.id.as_str());
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

        /// Tests that we can write then read any UserState to the DB and get the same
        /// UserState back, using an isolated temporary database per iteration.
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

        /// Tests that run_user_state_subscription correctly updates Automerge documents
        /// when user states are written to the database.
        ///
        /// This test:
        /// 1. Creates an isolated database and subscription
        /// 2. Generates user states and writes them to the database
        /// 3. Verifies that the Automerge documents are updated to match the database state
        #[proptest(async = "tokio", cases = 32)]
        async fn run_user_state_subscription_updates_automerge_docs(
            #[strategy(arbitrary_user_state_with_id())] user_id_and_state: (String, UserState),
        ) {
            use autosurgeon::hydrate;
            use backend::app::AppState;
            use backend::storage::PostgresStorage;
            use backend::user_state_subscription::run_user_state_subscription;
            use std::collections::{HashMap, HashSet};
            use std::sync::Arc;
            use std::time::Duration;
            use tokio::sync::RwLock;

            let (user_id, input_state) = user_id_and_state;
            let test_db = TestDb::new().await;

            // Create AppState using the isolated test database
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
                user_states: Arc::new(RwLock::new(HashMap::new())),
            };

            // Spawn the subscription in a background task
            let state_clone = state.clone();
            let subscription_handle =
                tokio::spawn(async move { run_user_state_subscription(state_clone).await });

            // Give the subscription time to start listening
            tokio::time::sleep(Duration::from_millis(100)).await;

            // Write user state to the database - this should trigger notifications
            write_user_state_to_db(user_id.clone(), test_db.pool(), &input_state)
                .await
                .expect("Failed to write user state");

            // Give the subscription time to process the notifications
            tokio::time::sleep(Duration::from_millis(500)).await;

            // Read the user state from samod using the stored DocumentId
            let automerge_state: Option<UserState> = {
                let doc_id = {
                    let states = state.user_states.read().await;
                    states.get(&user_id).cloned()
                };

                match doc_id {
                    Some(doc_id) => {
                        let doc_handle = match state.repo.find(doc_id.clone()).await {
                            Ok(Some(handle)) => Some(handle),
                            Ok(None) => None,
                            Err(_) => None,
                        };
                        doc_handle.and_then(|h| h.with_document(|doc| hydrate(doc)).ok())
                    }
                    None => None,
                }
            };

            // Abort the subscription task (it runs in an infinite loop)
            subscription_handle.abort();

            test_db.cleanup().await;

            // If input_state has no documents, no notifications are triggered
            // In this case, we expect no automerge doc to be created
            if input_state.documents.is_empty() {
                proptest::prop_assert!(
                    automerge_state.is_none(),
                    "Empty user state should not create automerge doc"
                );
            } else {
                // The Automerge doc should have been updated to match the input state
                proptest::prop_assert_eq!(
                    Some(input_state),
                    automerge_state,
                    "Automerge doc should be updated to match the database state"
                );
            }
        }
    }
}
