use socketioxide::SocketIo;
use sqlx::PgPool;
use thiserror::Error;

/** Top-level application state.

Cheaply cloneable and intended to be moved around the program.
 */
#[derive(Clone, Debug)]
pub struct AppState {
    pub db: PgPool,
    pub automerge_io: SocketIo,
}

/// Top-level application error.
#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Db(#[from] sqlx::Error),

    #[error("Error receiving socketio acknowledgment: {0}")]
    Ack(#[from] socketioxide::AckError<()>),
}
