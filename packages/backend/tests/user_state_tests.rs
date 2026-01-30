#[cfg(feature = "proptest")]
mod tests {
    use backend::app::AppError;
    use backend::auth::PermissionLevel;
    use backend::user_state::arbitrary::arbitrary_user_state_with_id;
    use backend::user_state::{UserState, read_user_state_from_db};
    use sqlx::PgPool;
    use test_strategy::proptest;

    async fn get_pool() -> PgPool {
        let database_url =
            std::env::var("DATABASE_URL").expect("DATABASE_URL must be set for tests");
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

    #[proptest(async = "tokio", cases = 256)]
    async fn user_state_roundtrip(
        #[strategy(arbitrary_user_state_with_id())] user_id_and_state: (String, UserState),
    ) {
        let (user_id, state) = user_id_and_state;
        let pool = get_pool().await;

        write_user_state_to_db(user_id.clone(), &pool, &state)
            .await
            .expect("Failed to write user state");

        let read_state = read_user_state_from_db(user_id.clone(), &pool)
            .await
            .expect("Failed to read user state");

        // Sort both document lists by ref_id for comparison
        let mut expected_docs = state.documents.clone();
        let mut actual_docs = read_state.documents.clone();
        expected_docs.sort_by(|a, b| a.ref_id.cmp(&b.ref_id));
        actual_docs.sort_by(|a, b| a.ref_id.cmp(&b.ref_id));

        // Cleanup test data
        let user_ids: Vec<&str> = std::iter::once(user_id.as_str())
            .chain(state.documents.iter().filter_map(|d| d.owner.as_ref().map(|o| o.id.as_str())))
            .collect();
        cleanup(&pool, &user_ids).await;

        proptest::prop_assert_eq!(expected_docs, actual_docs);
    }
}
