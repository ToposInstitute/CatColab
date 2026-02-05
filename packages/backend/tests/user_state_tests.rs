mod rpc_tests {
    use backend::app::{AppCtx, AppError, AppState};
    use backend::auth::{NewPermissions, PermissionLevel};
    use backend::document;
    use backend::user_state::{UserState, automerge_to_user_state, user_state_to_automerge};
    use backend::user_state_subscription::run_user_state_subscription;
    use firebase_auth::FirebaseUser;
    use serde_json::json;
    use serial_test::serial;
    use sqlx::PgPool;
    use std::collections::{HashMap, HashSet};
    use std::sync::{Arc, RwLock};
    use std::time::Duration;
    use tokio::sync::RwLock as TokioRwLock;
    use uuid::Uuid;

    async fn get_pool() -> PgPool {
        let database_url =
            dotenvy::var("DATABASE_URL").expect("DATABASE_URL must be set for tests");
        PgPool::connect(&database_url).await.expect("Failed to connect to database")
    }

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
            active_listeners: Arc::new(TokioRwLock::new(HashSet::new())),
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

    async fn ensure_user_exists(pool: &PgPool, user_id: &str) -> Result<(), AppError> {
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

    async fn cleanup_test_data(pool: &PgPool, user_ids: &[&str], ref_ids: &[Uuid]) {
        // Delete permissions first (foreign key constraint)
        for ref_id in ref_ids {
            let _ = sqlx::query("DELETE FROM permissions WHERE object = $1")
                .bind(ref_id)
                .execute(pool)
                .await;
        }

        // Delete users
        let _ = sqlx::query("DELETE FROM users WHERE id = ANY($1)")
            .bind(user_ids)
            .execute(pool)
            .await;

        // Note: refs and snapshots are not deleted here as they may have foreign key constraints
        // In a real test environment, you'd want a proper cleanup strategy
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
    #[tokio::test]
    #[serial]
    async fn test_new_ref_triggers_subscription_update() {
        let pool = get_pool().await;
        let state = create_test_app_state(pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        // Set up the subscription
        let user_states = Arc::new(RwLock::new(HashMap::new()));
        let empty_state = UserState { documents: vec![] };
        let initial_doc =
            user_state_to_automerge(&empty_state).expect("Failed to create initial doc");
        user_states.write().unwrap().insert(user_id.clone(), initial_doc);

        let pool_clone = pool.clone();
        let user_states_clone = user_states.clone();
        let subscription_handle = tokio::spawn(async move {
            run_user_state_subscription(&pool_clone, user_states_clone).await
        });

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
        let automerge_state = {
            let states = user_states.read().unwrap();
            states
                .get(&user_id)
                .map(|doc| automerge_to_user_state(doc).expect("Failed to convert"))
        };

        subscription_handle.abort();

        // Cleanup
        cleanup_test_data(&pool, &[&user_id], &[ref_id]).await;

        let automerge_state = automerge_state.expect("User state should exist");
        assert_eq!(automerge_state.documents.len(), 1, "Should have one document");
        assert_eq!(automerge_state.documents[0].ref_id, ref_id);
        assert_eq!(automerge_state.documents[0].name, "Test Document");
        assert_eq!(automerge_state.documents[0].permission_level, PermissionLevel::Own);
    }

    /// Tests that granting permissions to another user triggers their subscription update
    #[tokio::test]
    #[serial]
    async fn test_set_permissions_triggers_subscription_update() {
        let pool = get_pool().await;
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

        // Set up the subscription for the reader
        let user_states = Arc::new(RwLock::new(HashMap::new()));
        let empty_state = UserState { documents: vec![] };
        let initial_doc =
            user_state_to_automerge(&empty_state).expect("Failed to create initial doc");
        user_states.write().unwrap().insert(reader_id.clone(), initial_doc);

        let pool_clone = pool.clone();
        let user_states_clone = user_states.clone();
        let subscription_handle = tokio::spawn(async move {
            run_user_state_subscription(&pool_clone, user_states_clone).await
        });

        tokio::time::sleep(Duration::from_millis(100)).await;

        // Grant read permission to the reader
        let mut users = HashMap::new();
        users.insert(reader_id.clone(), PermissionLevel::Read);
        let new_permissions = NewPermissions {
            anyone: None,
            users,
        };

        backend::auth::set_permissions(&state, ref_id, new_permissions)
            .await
            .expect("Failed to set permissions");

        // Wait for the subscription to process
        tokio::time::sleep(Duration::from_millis(300)).await;

        // Check that the reader's state was updated
        let automerge_state = {
            let states = user_states.read().unwrap();
            states
                .get(&reader_id)
                .map(|doc| automerge_to_user_state(doc).expect("Failed to convert"))
        };

        subscription_handle.abort();

        cleanup_test_data(&pool, &[&owner_id, &reader_id], &[ref_id]).await;

        let automerge_state = automerge_state.expect("User state should exist");
        assert_eq!(automerge_state.documents.len(), 1, "Reader should see one document");
        assert_eq!(automerge_state.documents[0].ref_id, ref_id);
        assert_eq!(automerge_state.documents[0].permission_level, PermissionLevel::Read);
    }

    /// Tests that deleting a document triggers subscription update
    #[tokio::test]
    #[serial]
    async fn test_delete_ref_triggers_subscription_update() {
        let pool = get_pool().await;
        let state = create_test_app_state(pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        // Set up the subscription BEFORE creating the document
        let user_states = Arc::new(RwLock::new(HashMap::new()));
        let empty_state = UserState { documents: vec![] };
        let initial_doc =
            user_state_to_automerge(&empty_state).expect("Failed to create initial doc");
        user_states.write().unwrap().insert(user_id.clone(), initial_doc);

        let pool_clone = pool.clone();
        let user_states_clone = user_states.clone();
        let subscription_handle = tokio::spawn(async move {
            run_user_state_subscription(&pool_clone, user_states_clone).await
        });

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

        // Verify document exists in user state
        let state_before = {
            let states = user_states.read().unwrap();
            states
                .get(&user_id)
                .map(|doc| automerge_to_user_state(doc).expect("Failed to convert"))
        };
        assert_eq!(
            state_before.as_ref().map(|s| s.documents.len()),
            Some(1),
            "Should have one document before delete"
        );

        // Delete the document
        document::delete_ref(state.clone(), ref_id).await.expect("Failed to delete ref");

        // Wait for the subscription to process the delete notification
        tokio::time::sleep(Duration::from_millis(300)).await;

        // Check that the document is no longer in user state (soft deleted)
        let automerge_state = {
            let states = user_states.read().unwrap();
            states
                .get(&user_id)
                .map(|doc| automerge_to_user_state(doc).expect("Failed to convert"))
        };

        subscription_handle.abort();

        cleanup_test_data(&pool, &[&user_id], &[ref_id]).await;

        let automerge_state = automerge_state.expect("User state should exist");
        // Document should not appear in user state after deletion (since it's soft deleted)
        assert_eq!(
            automerge_state.documents.len(),
            0,
            "Should have no documents after soft delete"
        );
    }

    /// Tests that multiple users are notified when permissions change
    #[tokio::test]
    #[serial]
    async fn test_multiple_users_notified_on_permission_change() {
        let pool = get_pool().await;
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

        // Set up subscriptions for both users
        let user_states = Arc::new(RwLock::new(HashMap::new()));
        let empty_state = UserState { documents: vec![] };

        for user_id in [&user1_id, &user2_id] {
            let initial_doc =
                user_state_to_automerge(&empty_state).expect("Failed to create initial doc");
            user_states.write().unwrap().insert(user_id.clone(), initial_doc);
        }

        let pool_clone = pool.clone();
        let user_states_clone = user_states.clone();
        let subscription_handle = tokio::spawn(async move {
            run_user_state_subscription(&pool_clone, user_states_clone).await
        });

        tokio::time::sleep(Duration::from_millis(100)).await;

        // Grant permissions to both users at once
        let mut users = HashMap::new();
        users.insert(user1_id.clone(), PermissionLevel::Write);
        users.insert(user2_id.clone(), PermissionLevel::Read);
        let new_permissions = NewPermissions {
            anyone: None,
            users,
        };

        backend::auth::set_permissions(&state, ref_id, new_permissions)
            .await
            .expect("Failed to set permissions");

        // Wait for subscriptions to process
        tokio::time::sleep(Duration::from_millis(300)).await;

        // Check both users' states
        let user1_state = {
            let states = user_states.read().unwrap();
            states
                .get(&user1_id)
                .map(|doc| automerge_to_user_state(doc).expect("Failed to convert"))
        };
        let user2_state = {
            let states = user_states.read().unwrap();
            states
                .get(&user2_id)
                .map(|doc| automerge_to_user_state(doc).expect("Failed to convert"))
        };

        subscription_handle.abort();

        cleanup_test_data(&pool, &[&owner_id, &user1_id, &user2_id], &[ref_id]).await;

        let user1_state = user1_state.expect("User1 state should exist");
        let user2_state = user2_state.expect("User2 state should exist");

        assert_eq!(user1_state.documents.len(), 1, "User1 should see one document");
        assert_eq!(user1_state.documents[0].permission_level, PermissionLevel::Write);

        assert_eq!(user2_state.documents.len(), 1, "User2 should see one document");
        assert_eq!(user2_state.documents[0].permission_level, PermissionLevel::Read);
    }
}

#[cfg(feature = "proptest")]
mod proptest_tests {
    use backend::app::AppError;
    use backend::auth::PermissionLevel;
    use backend::user_state::arbitrary::arbitrary_user_state_with_id;
    use backend::user_state::{UserState, read_user_state_from_db};
    use serial_test::serial;
    use sqlx::PgPool;
    use test_strategy::proptest;

    async fn get_pool() -> PgPool {
        let database_url =
            dotenvy::var("DATABASE_URL").expect("DATABASE_URL must be set for tests");
        PgPool::connect(&database_url).await.expect("Failed to connect to database")
    }

    async fn cleanup(pool: &PgPool, user_ids: &[&str]) {
        // TODO: find saner way to setup and cleanup a test db
        let _ = sqlx::query("DELETE FROM permissions WHERE subject = ANY($1)")
            .bind(user_ids)
            .execute(pool)
            .await;

        let _ = sqlx::query("DELETE FROM users WHERE id = ANY($1)")
            .bind(user_ids)
            .execute(pool)
            .await;
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
        println!("Ensuring user exists: {user_id}");
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

        for doc in &state.documents {
            let owner_id = doc.owner.as_ref().map(|o| o.id.clone()).expect("No owner specified");

            // Ensure the owner exists in the users table
            println!("Ensuring owner exists: {owner_id}");
            if let Some(owner) = &doc.owner {
                sqlx::query!(
                    r#"
                    INSERT INTO users (id, created, signed_in, username, display_name)
                    VALUES ($1, NOW(), NOW(), $2, $3)
                    ON CONFLICT (id) DO NOTHING
                    "#,
                    owner_id,
                    owner.username,
                    owner.display_name
                )
                .execute(db)
                .await?;
            }

            // Create the ref and its head snapshot
            // We use a minimal JSON content since RefStub doesn't contain the full document
            let content = serde_json::json!({
                "name": doc.name,
                "type": doc.type_name
            });

            println!("Creating ref: {}", doc.ref_id);
            sqlx::query!(
                r#"
                WITH snapshot AS (
                    INSERT INTO snapshots (for_ref, content, last_updated, doc_id)
                    VALUES ($1, $2, $3, $4)
                    RETURNING id
                )
                INSERT INTO refs (id, head, created)
                VALUES ($1, (SELECT id FROM snapshot), $3)
                ON CONFLICT (id) DO NOTHING
                "#,
                doc.ref_id,
                content,
                doc.created_at,
                format!("test_fake_automerge_doc_{}", doc.ref_id) // Generate a placeholder doc_id
            )
            .execute(db)
            .await?;

            // Create owner permission
            println!("Creating owner permission: {owner_id} -> {}", doc.ref_id);
            sqlx::query!(
                r#"
                INSERT INTO permissions (subject, object, level)
                VALUES ($1, $2, 'own')
                ON CONFLICT (subject, object) DO NOTHING
                "#,
                owner_id,
                doc.ref_id
            )
            .execute(db)
            .await?;

            // Create permission for the user if different from owner
            if user_id != owner_id {
                println!("Creating user permission: {user_id} -> {}", doc.ref_id);
                sqlx::query!(
                    r#"
                    INSERT INTO permissions (subject, object, level)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (subject, object) DO UPDATE SET level = $3
                    "#,
                    user_id,
                    doc.ref_id,
                    doc.permission_level as PermissionLevel
                )
                .execute(db)
                .await?;
            }
        }

        Ok(())
    }

    // Tests that we can write then read any UserState to the DB and get the same UserState back.
    #[proptest(async = "tokio", cases = 32)]
    #[serial]
    async fn user_state_db_roundtrip(
        #[strategy(arbitrary_user_state_with_id())] user_id_and_state: (String, UserState),
    ) {
        let (user_id, input_state) = user_id_and_state;
        let pool = get_pool().await;

        write_user_state_to_db(user_id.clone(), &pool, &input_state)
            .await
            .expect("Failed to write user state");

        let output_state = read_user_state_from_db(user_id.clone(), &pool)
            .await
            .expect("Failed to read user state");

        // Cleanup test data
        let user_ids: Vec<&str> = std::iter::once(user_id.as_str())
            .chain(
                input_state
                    .documents
                    .iter()
                    .filter_map(|d| d.owner.as_ref().map(|o| o.id.as_str())),
            )
            .collect();
        cleanup(&pool, &user_ids).await;

        proptest::prop_assert_eq!(input_state, output_state);
    }

    /// Tests that run_user_state_subscription correctly updates Automerge documents
    /// when user states are written to the database.
    ///
    /// This test:
    /// 1. Creates a subscription to the database
    /// 2. Generates user states and writes them to the database
    /// 3. Verifies that the Automerge documents are updated to match the database state
    #[proptest(async = "tokio", cases = 32)]
    #[serial]
    async fn run_user_state_subscription_updates_automerge_docs(
        #[strategy(arbitrary_user_state_with_id())] user_id_and_state: (String, UserState),
    ) {
        use backend::user_state::{automerge_to_user_state, user_state_to_automerge};
        use backend::user_state_subscription::run_user_state_subscription;
        use std::collections::HashMap;
        use std::sync::{Arc, RwLock};
        use std::time::Duration;

        let (user_id, input_state) = user_id_and_state;
        let pool = get_pool().await;

        // Initialize user states map with an empty Automerge doc for the test user
        let empty_state = UserState { documents: vec![] };
        let initial_doc =
            user_state_to_automerge(&empty_state).expect("Failed to create initial Automerge doc");

        let user_states = Arc::new(RwLock::new(HashMap::new()));
        user_states.write().unwrap().insert(user_id.clone(), initial_doc);

        // Spawn the subscription in a background task
        let pool_clone = pool.clone();
        let user_states_clone = user_states.clone();
        let subscription_handle = tokio::spawn(async move {
            run_user_state_subscription(&pool_clone, user_states_clone).await
        });

        // Give the subscription time to start listening
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Write user state to the database - this should trigger notifications
        write_user_state_to_db(user_id.clone(), &pool, &input_state)
            .await
            .expect("Failed to write user state");

        // Give the subscription time to process the notifications
        tokio::time::sleep(Duration::from_millis(200)).await;

        // Read the Automerge doc state
        let automerge_state = {
            let states = user_states.read().unwrap();
            states
                .get(&user_id)
                .map(|doc| automerge_to_user_state(doc).expect("Failed to convert from Automerge"))
        };

        // Cleanup test data
        let user_ids: Vec<&str> = std::iter::once(user_id.as_str())
            .chain(
                input_state
                    .documents
                    .iter()
                    .filter_map(|d| d.owner.as_ref().map(|o| o.id.as_str())),
            )
            .collect();
        cleanup(&pool, &user_ids).await;

        // Abort the subscription task (it runs in an infinite loop)
        subscription_handle.abort();

        // The Automerge doc should have been updated to match the input state
        // This assertion will fail until run_user_state_subscription is fully implemented
        let automerge_state = automerge_state.expect("User state should exist in Automerge docs");
        proptest::prop_assert_eq!(
            input_state,
            automerge_state,
            "Automerge doc should be updated to match the database state"
        );
    }
}
