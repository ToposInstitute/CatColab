use axum::{routing::get, Router};
use firebase_auth::FirebaseAuth;
use socketioxide::SocketIo;
use sqlx::postgres::PgPoolOptions;
use tower::ServiceBuilder;
use tower_http::cors::CorsLayer;
use tracing::{error, info};

mod app;
mod auth;
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
        let firebase_auth = FirebaseAuth::new(
            &dotenvy::var("FIREBASE_PROJECT_ID").expect("`FIREBASE_PROJECT_ID` should be set"),
        )
        .await;

        let port = web_port();
        let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await.unwrap();

        let router = rpc::router();
        let (qubit_service, qubit_handle) = router.to_service(state);
        let qubit_service = ServiceBuilder::new()
            .map_request(move |mut req: hyper::Request<_>| {
                match auth::authenticate_from_request(&firebase_auth, &req) {
                    Ok(Some(user)) => {
                        req.extensions_mut().insert(user);
                    }
                    Ok(None) => {}
                    Err(err) => {
                        error!("Authentication error: {}", err);
                    }
                };
                req
            })
            .service(qubit_service);

        let app = Router::new()
            .route("/", get(|| async { "Hello! The CatColab server is running" }))
            .nest_service("/rpc", qubit_service)
            .layer(CorsLayer::permissive());
        info!("Web server listening at port {}", port);
        axum::serve(listener, app).await.unwrap();

        qubit_handle.stop().unwrap();
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
