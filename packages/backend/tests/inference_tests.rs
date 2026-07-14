//! Integration tests for OpenRouter inference key management.
//!
//!
//! These tests require a running PostgreSQL database, and mock real response
//! transcripts recorded from OpenRouter.

#[cfg(feature = "integration-tests")]
mod common;

#[cfg(feature = "integration-tests")]
mod integration_tests {
    use crate::common::test_utils::{
        create_test_app_state, create_test_firebase_user, ensure_user_exists, run_migrations,
    };
    use backend::app::{AppCtx, AppError, AppState};
    use backend::inference;
    use sqlx::PgPool;
    use uuid::Uuid;
    use wiremock::matchers::{body_partial_json, header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    /// A censored OpenRouter plaintext key (real shape: `sk-or-v1-...`).
    const FAKE_KEY: &str = "sk-or-v1-testkeyredacted0000000000000000000000000000000000000000";
    /// A censored OpenRouter key hash (real shape: 64-char hex).
    const FAKE_HASH: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    /// The provisioning key the tests configure on `AppState`; the wiremock
    /// matchers assert it is sent as a bearer token.
    const PROVISIONING_KEY: &str = "test-provisioning-key";

    /// Build a `POST /keys` 201 response body matching the real shape.
    fn create_key_response_body() -> serde_json::Value {
        serde_json::json!({
            "data": {
                "hash": FAKE_HASH,
                "name": "catcolab:RECORDING",
                "label": "sk-or-v1-test...e47",
                "disabled": false,
                "limit": 5,
                "limit_remaining": 5,
                "limit_reset": "daily",
                "include_byok_in_limit": false,
                "usage": 0,
                "usage_daily": 0,
                "usage_weekly": 0,
                "usage_monthly": 0,
                "byok_usage": 0,
                "byok_usage_daily": 0,
                "byok_usage_weekly": 0,
                "byok_usage_monthly": 0,
                "created_at": "2026-07-15T13:35:18.151Z",
                "updated_at": null,
                "expires_at": null,
                "creator_user_id": "user_REDACTED",
                "workspace_id": "REDACTED"
            },
            "key": FAKE_KEY
        })
    }

    /// The `DELETE /keys/{hash}` 200 body recorded from OpenRouter.
    fn delete_ok_body() -> serde_json::Value {
        serde_json::json!({"deleted": true})
    }

    /// The `DELETE /keys/{hash}` 404 body recorded from OpenRouter.
    fn delete_not_found_body() -> serde_json::Value {
        serde_json::json!({"error": {"message": "API key not found", "code": 404}})
    }

    /// Mount a `POST /keys` mock returning a 201 with the censored create
    /// response, asserting it is called exactly `n` times.
    async fn mount_create_key(server: &MockServer, n: u64) {
        Mock::given(method("POST"))
            .and(path("/keys"))
            .and(header("authorization", format!("Bearer {PROVISIONING_KEY}")))
            .and(body_partial_json(serde_json::json!({"limit": 5.0, "limit_reset": "daily"})))
            .respond_with(ResponseTemplate::new(201).set_body_json(create_key_response_body()))
            .expect(n)
            .mount(server)
            .await;
    }

    /// Mount a `DELETE /keys/{hash}` mock returning a 200, asserting `n` calls.
    async fn mount_delete_ok(server: &MockServer, n: u64) {
        Mock::given(method("DELETE"))
            .and(path(format!("/keys/{FAKE_HASH}")))
            .and(header("authorization", format!("Bearer {PROVISIONING_KEY}")))
            .respond_with(ResponseTemplate::new(200).set_body_json(delete_ok_body()))
            .expect(n)
            .mount(server)
            .await;
    }

    /// Build an `AppState` whose OpenRouter client is wired to the mock at
    /// `server.uri()`.
    async fn state_for(server: &MockServer, pool: PgPool) -> AppState {
        let mut state = create_test_app_state(pool).await;
        state.openrouter_provisioning_key = Some(PROVISIONING_KEY.to_string());
        state.openrouter_base_url = server.uri();
        state
    }

    /// Seed a `users` row with an existing inference key/hash, as if a key had
    /// already been created.
    async fn seed_user_with_key(pool: &PgPool, user_id: &str) {
        ensure_user_exists(pool, user_id).await.expect("Failed to create user");
        sqlx::query("UPDATE users SET inference_key = $2, inference_hash = $3 WHERE id = $1")
            .bind(user_id)
            .bind(FAKE_KEY)
            .bind(FAKE_HASH)
            .execute(pool)
            .await
            .expect("Failed to seed inference key");
    }

    /// Read the persisted `(inference_key, inference_hash)` pair for a user.
    async fn persisted_key(pool: &PgPool, user_id: &str) -> (Option<String>, Option<String>) {
        sqlx::query_as("SELECT inference_key, inference_hash FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_one(pool)
            .await
            .expect("Failed to read inference key")
    }

    /// A cached key is returned without contacting OpenRouter.
    #[sqlx::test]
    async fn get_inference_key_returns_cached_without_calling_openrouter(
        pool: PgPool,
    ) -> sqlx::Result<()> {
        run_migrations(&pool).await?;

        let server = MockServer::start().await;
        let state = state_for(&server, pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        seed_user_with_key(&pool, &user_id).await;

        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&user_id)),
        };

        let key = inference::get_inference_key(&ctx).await.expect("cached key should be returned");
        assert_eq!(key, FAKE_KEY);

        // No OpenRouter request should have been made.
        assert!(
            server.received_requests().await.unwrap().is_empty(),
            "expected no OpenRouter calls for a cached key"
        );

        Ok(())
    }

    /// A missing key is created, persisted, and returned.
    #[sqlx::test]
    async fn get_inference_key_mints_and_persists(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;

        let server = MockServer::start().await;
        mount_create_key(&server, 1).await;
        let state = state_for(&server, pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&user_id)),
        };

        let key = inference::get_inference_key(&ctx).await.expect("key should be minted");
        assert_eq!(key, FAKE_KEY);

        let (persisted_key, persisted_hash) = persisted_key(&pool, &user_id).await;
        assert_eq!(persisted_key.as_deref(), Some(FAKE_KEY));
        assert_eq!(persisted_hash.as_deref(), Some(FAKE_HASH));

        server.verify().await;
        Ok(())
    }

    /// A failed creation propagates `AppError::OpenRouter` and writes nothing.
    #[sqlx::test]
    async fn get_inference_key_propagates_openrouter_error(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;

        let server = MockServer::start().await;
        // Censored `POST /keys` 400 body recorded from OpenRouter (ZodError on a
        // bad `limit` type).
        Mock::given(method("POST"))
            .and(path("/keys"))
            .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
                "success": false,
                "error": {
                    "name": "ZodError",
                    "message": "Invalid input: expected number, received string"
                }
            })))
            .expect(1)
            .mount(&server)
            .await;
        let state = state_for(&server, pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        ensure_user_exists(&pool, &user_id).await.expect("Failed to create user");

        let ctx = AppCtx {
            state: state.clone(),
            user: Some(create_test_firebase_user(&user_id)),
        };

        let err = inference::get_inference_key(&ctx).await.expect_err("mint should fail");
        assert!(matches!(err, AppError::OpenRouter(_)), "got {err:?}");

        let (k, h) = persisted_key(&pool, &user_id).await;
        assert!(k.is_none() && h.is_none(), "no key should be persisted on error");

        server.verify().await;
        Ok(())
    }

    /// Invalidating an existing key nulls the DB columns and deletes remotely.
    #[sqlx::test]
    async fn invalidate_inference_key_annuls_and_persists(pool: PgPool) -> sqlx::Result<()> {
        run_migrations(&pool).await?;

        let server = MockServer::start().await;
        mount_delete_ok(&server, 1).await;
        let state = state_for(&server, pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        seed_user_with_key(&pool, &user_id).await;
        assert_eq!(persisted_key(&pool, &user_id).await.0.as_deref(), Some(FAKE_KEY));

        inference::invalidate_inference_key(
            &pool,
            &state.http_client,
            &state.openrouter_base_url,
            PROVISIONING_KEY,
            &user_id,
        )
        .await
        .expect("invalidation should succeed");

        let (k, h) = persisted_key(&pool, &user_id).await;
        assert!(k.is_none() && h.is_none(), "columns should be nulled after invalidation");

        server.verify().await;
        Ok(())
    }

    /// Invalidating a key that OpenRouter no longer knows about (404) is a
    /// success and the local data is still nulled.
    #[sqlx::test]
    async fn invalidate_inference_key_handles_already_deleted_key(
        pool: PgPool,
    ) -> sqlx::Result<()> {
        run_migrations(&pool).await?;

        let server = MockServer::start().await;
        Mock::given(method("DELETE"))
            .and(path(format!("/keys/{FAKE_HASH}")))
            .respond_with(ResponseTemplate::new(404).set_body_json(delete_not_found_body()))
            .expect(1)
            .mount(&server)
            .await;
        let state = state_for(&server, pool.clone()).await;

        let user_id = format!("test_user_{}", Uuid::now_v7());
        seed_user_with_key(&pool, &user_id).await;

        inference::invalidate_inference_key(
            &pool,
            &state.http_client,
            &state.openrouter_base_url,
            PROVISIONING_KEY,
            &user_id,
        )
        .await
        .expect("404 should be handled gracefully");

        let (k, h) = persisted_key(&pool, &user_id).await;
        assert!(k.is_none() && h.is_none(), "columns should still be nulled on 404");

        server.verify().await;
        Ok(())
    }
}
