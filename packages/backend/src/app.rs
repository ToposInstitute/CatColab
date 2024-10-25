use firebase_auth::FirebaseUser;
use socketioxide::SocketIo;
use sqlx::PgPool;
use thiserror::Error;

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
    /// Application state;
    pub state: AppState,

    /// Authenticated Firebase user, if any.
    pub user: Option<FirebaseUser>,
}

/// Top-level application error.
#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Db(#[from] sqlx::Error),

    #[error("Error receiving socket.io acknowledgment: {0}")]
    Ack(#[from] socketioxide::AckError<()>),

    #[error("Attempted to perform unauthorized action")]
    Unauthorized,
}
