use axum::{routing::get, Router};
use socketioxide::SocketIo;
use sqlx::postgres::PgPoolOptions;

mod app;
mod rpc;
mod socket;

#[tokio::main]
async fn main() {
    let db = PgPoolOptions::new()
        .max_connections(10)
        .connect(&dotenvy::var("DATABASE_URL").expect("`DATABASE_URL` should be set"))
        .await
        .unwrap();

    let (io_layer, io) = SocketIo::new_layer();

    let ctx = app::AppCtx {
        automerge_io: io,
        db,
    };

    socket::setup_automerge_socket(ctx.clone());

    let main_task = tokio::task::spawn(async {
        let listener = tokio::net::TcpListener::bind("localhost:8000").await.unwrap();
        let router = rpc::router().arced();
        let app = Router::new()
            .route("/", get(|| async { "Hello! The CatColab server is running" }))
            .nest("/rpc", rspc_axum::endpoint(router, || ctx));
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
