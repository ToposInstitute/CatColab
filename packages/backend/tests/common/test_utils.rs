use backend::app::{AppError, AppState};
use firebase_auth::FirebaseUser;
use serde_json::json;
use sqlx::PgPool;
use sqlx_migrator::migrator::{Migrate, Migrator};
use sqlx_migrator::{Info, Plan};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::RwLock;

pub async fn run_migrations(pool: &PgPool) -> Result<(), sqlx::Error> {
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

pub async fn create_test_app_state(pool: PgPool) -> AppState {
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
        http_client: reqwest::Client::new(),
        julia_url: None,
        suppress_autosave: Arc::new(RwLock::new(HashSet::new())),
    }
}

pub fn create_test_firebase_user(user_id: &str) -> FirebaseUser {
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

pub fn create_test_document_content(name: &str) -> serde_json::Value {
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
