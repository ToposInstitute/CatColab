#[cfg(feature = "proptest")]
mod tests {
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
    #[proptest(async = "tokio", cases = 8)]
    #[serial]
    #[ignore]
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
        user_states
            .write()
            .unwrap()
            .insert(user_id.clone(), initial_doc);

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
