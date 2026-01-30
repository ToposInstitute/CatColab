#[cfg(feature = "proptest")]
mod tests {
    use backend::app::AppError;
    use backend::auth::PermissionLevel;
    use backend::user_state::UserState;
    use proptest::prelude::*;
    use sqlx::PgPool;

    struct UserStateTestFixture {
        pool: PgPool,
    }

    impl UserStateTestFixture {
        async fn setup() -> Self {
            let database_url =
                std::env::var("DATABASE_URL").expect("DATABASE_URL must be set for tests");

            let pool = PgPool::connect(&database_url).await.expect("Failed to connect to database");

            Self { pool }
        }

        async fn cleanup(&self, user_ids: &[&str]) {
            // TODO: find saner way to setup and cleanup a test db
            let _ = sqlx::query("DELETE FROM permissions WHERE subject = ANY($1)")
                .bind(user_ids)
                .execute(&self.pool)
                .await;

            let _ = sqlx::query("DELETE FROM users WHERE id = ANY($1)")
                .bind(user_ids)
                .execute(&self.pool)
                .await;
        }
    }

    /// Writes user state to the database. This is only for testing purposes.
    ///
    /// This function persists a `UserState` by:
    /// 1. Ensuring all owner users exist in the `users` table
    /// 2. Creating refs and their head snapshots
    /// 3. Creating permission entries for the user on each document
    pub async fn write_user_state_to_db(
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
            // If there's an owner, ensure they exist in the users table
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
                format!("doc_{}", doc.ref_id) // Generate a placeholder doc_id
            )
            .execute(db)
            .await?;

            // Create permission for the user on this document
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

            // If there's an owner and it's different from the user, create owner permission
            if let Some(owner) = &doc.owner {
                if owner.id != user_id {
                    sqlx::query!(
                        r#"
                        INSERT INTO permissions (subject, object, level)
                        VALUES ($1, $2, 'own')
                        ON CONFLICT (subject, object) DO NOTHING
                        "#,
                        owner.id,
                        doc.ref_id
                    )
                    .execute(db)
                    .await?;
                }
            }
        }

        Ok(())
    }

    proptest! {
        #[test]
        fn generates_user_states_always_true(_state in any::<UserState>()) {
            prop_assert!(true);
        }
    }
}
