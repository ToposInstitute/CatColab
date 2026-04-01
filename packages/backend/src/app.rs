use firebase_auth::FirebaseUser;
use samod::DocumentId;
use sqlx::PgPool;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::{Mutex, RwLock};
use uuid::Uuid;

/// Top-level application state.
///
/// Cheaply cloneable and intended to be moved around the program.
#[derive(Clone)]
pub struct AppState {
    /// Connection to the Postgres database.
    pub db: PgPool,

    /// Automerge-repo provider.
    pub repo: samod::Repo,

    /// Tracks which ref_ids have active autosave listeners to prevent duplicates.
    pub active_listeners: Arc<RwLock<HashSet<Uuid>>>,

    /// Per-ref mutex guarding modifications to `current_snapshot`.
    ///
    /// Both autosave (`create_snapshot`) and `set_current_snapshot` need to
    /// coordinate: `set_current_snapshot` acquires the lock and waits,
    /// while autosave uses `try_lock` and silently skips when the lock is held.
    pub modifying_current_snapshot: Arc<RwLock<HashMap<Uuid, Arc<Mutex<()>>>>>,

    /// Tracks user IDs whose state docs were refreshed from DB in this process,
    /// mapped to their Automerge document IDs.
    pub initialized_user_states: Arc<RwLock<HashMap<String, DocumentId>>>,

    /// HTTP client for outgoing requests (e.g., Julia proxy).
    pub http_client: reqwest::Client,

    /// Base URL for the Julia compute service, if configured.
    pub julia_url: Option<String>,
}

impl AppState {
    /// Get or create the per-ref mutex for `current_snapshot` modifications.
    pub async fn snapshot_lock(&self, ref_id: Uuid) -> Arc<Mutex<()>> {
        // Fast path: read lock.
        {
            let locks = self.modifying_current_snapshot.read().await;
            if let Some(lock) = locks.get(&ref_id) {
                return lock.clone();
            }
        }
        // Slow path: write lock to insert.
        let mut locks = self.modifying_current_snapshot.write().await;
        locks.entry(ref_id).or_insert_with(|| Arc::new(Mutex::new(()))).clone()
    }
}

/// Context available to RPC procedures.
#[derive(Clone)]
pub struct AppCtx {
    /// Application state.
    pub state: AppState,

    /// Authenticated Firebase user, if any.
    pub user: Option<FirebaseUser>,
}

/// Top-level application error.
#[derive(Error, Debug)]
pub enum AppError {
    /// Error from the SQL database.
    #[error("SQL database error: {0}")]
    Db(#[from] sqlx::Error),

    /// Error from the Automerge Repo.
    #[error("AutomergeRepo error: {0}")]
    AutomergeRepo(#[from] samod::Stopped),

    /// Error from Automerge operations.
    #[error("Automerge error: {0}")]
    Automerge(#[from] automerge::AutomergeError),

    /// Error with user state sync.
    #[error("UserStateSync error: {0}")]
    UserStateSync(String),

    /// Error from JSON serialization.
    #[error("JSON serialization error: {0}")]
    Json(#[from] serde_json::Error),

    /// Client made request with invalid data.
    #[error("Request with invalid data: {0}")]
    Invalid(String),

    /// Client has not authenticated using Firebase auth.
    #[error("Authentication credentials were not provided")]
    Unauthorized,

    /// Client does not have permission to perform the requested action on the
    /// document ref.
    #[error("Not authorized to access ref: {0}")]
    Forbidden(Uuid),
}
