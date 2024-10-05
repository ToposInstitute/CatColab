use socketioxide::extract::{Data, SocketRef};

use super::app::{AppCtx, RefContent};

/// Set up the socket that communicates with the Automerge doc server.
pub fn setup_automerge_socket(ctx: AppCtx) {
    let io = ctx.automerge_io.clone();

    io.ns("/", |socket: SocketRef| {
        println!("Automerge socket connected at namespace {:?}", socket.ns());

        socket.on("autosave", |_: SocketRef, Data::<RefContent>(data)| ctx.autosave(data));
    });
}
