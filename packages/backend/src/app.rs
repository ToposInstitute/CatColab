use firebase_auth::FirebaseUser;
use serde::Serialize;
use sqlx::PgPool;
use std::collections::HashSet;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::user_state_subscription::UserStates;

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

    /// User state Automerge documents, keyed by user ID.
    pub user_states: UserStates,
}

/// Context available to RPC procedures.
#[derive(Clone)]
pub struct AppCtx {
    /// Application state.
    pub state: AppState,

    /// Authenticated Firebase user, if any.
    pub user: Option<FirebaseUser>,
}

/// A page of items along with pagination metadata.
#[qubit::ts]
#[derive(Clone, Debug, Serialize)]
pub struct Paginated<T> {
    /// The total number of items matching the query criteria.
    pub total: i32,

    /// The number of items skipped.
    pub offset: i32,

    /// The items in the current page.
    pub items: Vec<T>,
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
