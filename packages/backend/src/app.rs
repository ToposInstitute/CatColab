use firebase_auth::FirebaseUser;
use samod::DocumentId;
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::{RwLock, mpsc, oneshot};
use uuid::Uuid;

/// Reply channel type used by all ref actor messages.
pub type RefReply = oneshot::Sender<Result<(), AppError>>;

/// Type alias for the ref actors channel map.
pub type RefActorsMap = Arc<RwLock<HashMap<Uuid, mpsc::Sender<(RefMsg, RefReply)>>>>;

/// Message sent to the ref actor for a document ref.
pub enum RefMsg {
    /// Request an immediate snapshot (manual save / RPC call).
    CreateSnapshot,
    /// Set the current snapshot for the document ref.
    SetCurrentSnapshot {
        /// The target snapshot to set as current.
        snapshot_id: i32,
    },
    /// Soft-delete the document ref.
    Delete,
    /// Restore a soft-deleted document ref.
    Restore,
}

/// Top-level application state.
///
/// Cheaply cloneable and intended to be moved around the program.
#[derive(Clone)]
pub struct AppState {
    /// Connection to the Postgres database.
    pub db: PgPool,

    /// Automerge-repo provider.
    pub repo: samod::Repo,

    /// Channel senders for per-ref actors that coordinate document mutations.
    pub ref_actors: RefActorsMap,

    /// Tracks user IDs whose state docs were refreshed from DB in this process,
    /// mapped to their Automerge document IDs.
    pub initialized_user_states: Arc<RwLock<HashMap<String, DocumentId>>>,

    /// HTTP client for outgoing requests (e.g., Julia proxy).
    pub http_client: reqwest::Client,

    /// Base URL for the Julia compute service, if configured.
    pub julia_url: Option<String>,
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
