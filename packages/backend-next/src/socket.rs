use socketioxide::extract::{Data, SocketRef};

use super::app::AppState;
use super::document as doc;

/// Set up the socket that communicates with the Automerge doc server.
pub fn setup_automerge_socket(state: AppState) {
    let io = state.automerge_io.clone();

    io.ns("/", |socket: SocketRef| {
        println!("Automerge socket connected at namespace {:?}", socket.ns());

        socket.on("autosave", |_: SocketRef, Data::<doc::RefContent>(data)| async move {
            // FIXME: Log any error rather than ignoring it.
            doc::autosave(state, data).await.ok();
        });
    });
}
