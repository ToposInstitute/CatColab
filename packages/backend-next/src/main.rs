use axum::{routing::get, Router};
use socketioxide::SocketIo;
use sqlx::postgres::PgPoolOptions;
use tracing::info;

mod app;
mod document;
mod rpc;
mod socket;

/// Port for the web server providing the RPC API.
fn web_port() -> String {
    dotenvy::var("PORT").unwrap_or("8000".to_string())
}

/** Port for internal communication with the Automerge doc server.

This port should *not* be open to the public.
*/
fn automerge_io_port() -> String {
    dotenvy::var("AUTOMERGE_IO_PORT").unwrap_or("3000".to_string())
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_max_level(tracing::Level::INFO).init();

    let db = PgPoolOptions::new()
        .max_connections(10)
        .connect(&dotenvy::var("DATABASE_URL").expect("`DATABASE_URL` should be set"))
        .await
        .expect("Failed to connect to database");

    let (io_layer, io) = SocketIo::new_layer();

    let state = app::AppState {
        automerge_io: io,
        db,
    };

    socket::setup_automerge_socket(state.clone());

    let main_task = tokio::task::spawn(async {
        let port = web_port();
        let listener = tokio::net::TcpListener::bind(format!("localhost:{}", port)).await.unwrap();
        let router = rpc::router().arced();
        let app = Router::new()
            .route("/", get(|| async { "Hello! The CatColab server is running" }))
            .nest("/rpc", rspc_axum::endpoint(router, || state));
        info!("Web server listening at port {}", port);
        axum::serve(listener, app).await.unwrap();
    });

    let automerge_io_task = tokio::task::spawn(async {
        let port = automerge_io_port();
        let listener = tokio::net::TcpListener::bind(format!("localhost:{}", port)).await.unwrap();
        let app = Router::new().layer(io_layer);
        info!("Automerge socket listening at port {}", port);
        axum::serve(listener, app).await.unwrap();
    });

    let (res_main, res_io) = tokio::join!(main_task, automerge_io_task);
    res_main.unwrap();
    res_io.unwrap();
}
