use axum::{routing::get, Router};
use socketioxide::{extract::SocketRef, SocketIo};

mod rpc;

#[tokio::main]
async fn main() {
    let (io_layer, io) = SocketIo::new_layer();

    io.ns("/", |socket: SocketRef| {
        println!("Socket.IO connected: {:?}", socket.ns());
    });

    let main_task = tokio::task::spawn(async {
        let listener = tokio::net::TcpListener::bind("localhost:8000").await.unwrap();
        let router = rpc::router().arced();
        let app = Router::new()
            .route("/", get(|| async { "Hello! The CatColab server is running" }))
            .nest("/rpc", rspc_axum::endpoint(router, || rpc::AppCtx { automerge_io: io }));
        axum::serve(listener, app).await.unwrap()
    });

    let automerge_io_task = tokio::task::spawn(async {
        let listener = tokio::net::TcpListener::bind("localhost:3000").await.unwrap();
        let app = Router::new().layer(io_layer);
        axum::serve(listener, app).await.unwrap()
    });

    let (res_main, res_io) = tokio::join!(main_task, automerge_io_task);
    res_main.unwrap();
    res_io.unwrap();
}
