use axum::{
    extract::{Path, State},
    routing::get,
    Router,
};
use socketioxide::{extract::SocketRef, SocketIo};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    automerge_io: SocketIo,
}

async fn doc_id(State(state): State<AppState>, Path(ref_id): Path<Uuid>) -> String {
    let ack = state.automerge_io.emit_with_ack::<Vec<String>>("doc_id", ref_id).unwrap();
    let response = ack.await.unwrap();
    format!("Received doc ID {}", response.data[0])
}

fn on_connect(socket: SocketRef) {
    println!("Socket.IO connected: {:?}", socket.ns());
}

#[tokio::main]
async fn main() {
    let (io_layer, io) = SocketIo::new_layer();

    io.ns("/", on_connect);

    let state = AppState { automerge_io: io };

    let web_task = tokio::task::spawn(async {
        let listener = tokio::net::TcpListener::bind("0.0.0.0:8000").await.unwrap();
        let app = Router::new().route("/doc_id/:ref_id", get(doc_id)).with_state(state);
        axum::serve(listener, app).await.unwrap()
    });

    let io_task = tokio::task::spawn(async {
        let listener = tokio::net::TcpListener::bind("localhost:3000").await.unwrap();
        let app = Router::new().layer(io_layer);
        axum::serve(listener, app).await.unwrap()
    });

    let (res_web, res_io) = tokio::join!(web_task, io_task);
    res_web.unwrap();
    res_io.unwrap();
}
