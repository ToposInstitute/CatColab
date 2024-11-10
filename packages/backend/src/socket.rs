use socketioxide::extract::{Data, SocketRef};
use tracing::{error, info};

use super::app::AppState;
use super::document as doc;

/// Set up the socket that communicates with the Automerge doc server.
pub fn setup_automerge_socket(state: AppState) {
    let io = state.automerge_io.clone();

    io.ns("/", |socket: SocketRef| {
        info!("Automerge socket connected at namespace {}", socket.ns());

        socket.on("autosave", |_: SocketRef, Data::<doc::RefContent>(data)| async move {
            if let Err(err) = doc::autosave(state, data).await {
                error!("Autosave failed with error: {}", err);
            }
        });
    });
}
