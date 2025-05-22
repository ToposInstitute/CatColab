use firebase_auth::FirebaseUser;
use serde::Serialize;
use socketioxide::SocketIo;
use sqlx::PgPool;
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

/** Top-level application state.

Cheaply cloneable and intended to be moved around the program.
 */
#[derive(Clone)]
pub struct AppState {
    /// Connection to the Postgres database.
    pub db: PgPool,

    /// Socket for communicating with Automerge document server.
    pub automerge_io: SocketIo,
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
#[derive(Clone, Debug, Serialize, TS)]
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

    /// Error from the socket communicating with the Automerge document server.
    #[error("Error receiving acknowledgment from socket: {0}")]
    Ack(#[from] socketioxide::AckError<()>),

    /// Client made request with invalid data.
    #[error("Request with invalid data: {0}")]
    Invalid(String),

    /// Client has not authenticated using Firebase auth.
    #[error("Authentication credentials were not provided")]
    Unauthorized,

    /// Something went wrong in a socket call to the automerge server
    #[error("Automerge server error: {0}")]
    AutomergeServer(String),

    /// Client does not have permission to perform the requested action on the
    /// document ref.
    #[error("Not authorized to access ref: {0}")]
    Forbidden(Uuid),
}
