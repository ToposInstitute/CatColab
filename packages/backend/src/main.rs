use axum::extract::Request;

use axum::middleware::{Next, from_fn_with_state};
use axum::{Router, routing::get};
use axum::{extract::State, response::IntoResponse};
use clap::{Parser, Subcommand};
use firebase_auth::FirebaseAuth;
use http::StatusCode;
use socketioxide::SocketIo;
use socketioxide::layer::SocketIoLayer;
use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Postgres};
use sqlx_migrator::cli::MigrationCommand;
use sqlx_migrator::migrator::{Migrate, Migrator};
use sqlx_migrator::{Info, Plan};
use std::path::Path;
use std::sync::Arc;
use tokio::sync::watch;
use tower::ServiceBuilder;
use tower_http::cors::CorsLayer;
use tracing::{error, info};
use tracing_subscriber::filter::{EnvFilter, LevelFilter};

mod app;
mod auth;
mod document;
mod rpc;
mod socket;
mod user;

use app::AppStatus;

/// Port for the web server providing the RPC API.
fn web_port() -> String {
    dotenvy::var("PORT").unwrap_or("8000".to_string())
}

/// Port for internal communication with the Automerge doc server.
///
/// This port should *not* be open to the public.
fn automerge_io_port() -> String {
    dotenvy::var("AUTOMERGE_IO_PORT").unwrap_or("3000".to_string())
}

#[derive(Parser, Debug)]
#[command(name = "catcolab")]
#[command(about = "CatColab server and migration CLI", version)]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Run database migrations (proxied to sqlx_migrator)
    Migrator(MigrationCommand),
    /// Start the web server (default)
    Serve,
}

#[tokio::main]
async fn main() {
    let env_filter = EnvFilter::builder()
        .with_default_directive(LevelFilter::INFO.into())
        .from_env_lossy();

    tracing_subscriber::fmt().with_env_filter(env_filter).init();

    let db = PgPoolOptions::new()
        .max_connections(10)
        .connect(&dotenvy::var("DATABASE_URL").expect("`DATABASE_URL` should be set"))
        .await
        .expect("Failed to connect to database");

    let cli = Cli::parse();

    let mut migrator = Migrator::default();
    migrator
        .add_migrations(migrator::migrations())
        .expect("Failed to load migrations");

    match cli.command.unwrap_or(Command::Serve) {
        Command::Migrator(cmd) => {
            let mut conn = db.acquire().await.expect("Failed to acquire DB connection");

            cmd.run(&mut *conn, Box::new(migrator)).await.unwrap();
            return;
        }

        Command::Serve => {
            let (io_layer, io) = SocketIo::new_layer();

            let (status_tx, status_rx) = watch::channel(AppStatus::Starting);
            let state = app::AppState {
                automerge_io: io,
                db: db.clone(),
                app_status: status_rx.clone(),
            };

            // We need to wrap FirebaseAuth in an Arc because if it's ever dropped the process which updates it's
            // jwt keys will be killed. The library is using the anti pattern of implementing both Clone and Drop on the
            // same struct.
            // https://github.com/trchopan/firebase-auth/issues/30
            let firebase_auth = Arc::new(
                FirebaseAuth::new(
                    &dotenvy::var("FIREBASE_PROJECT_ID")
                        .expect("`FIREBASE_PROJECT_ID` should be set"),
                )
                .await,
            );

            socket::setup_automerge_socket(state.clone());

            tokio::try_join!(
                run_migrator_apply(db.clone(), migrator, status_tx.clone()),
                run_web_server(state.clone(), firebase_auth.clone()),
                run_automerge_socket(io_layer),
            )
            .unwrap();
        }
    }
}

async fn run_migrator_apply(
    db: PgPool,
    migrator: Migrator<Postgres>,
    status_tx: watch::Sender<AppStatus>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    status_tx.send(AppStatus::Migrating)?;
    info!("Applying database migrations...");

    let mut conn = db.acquire().await?;
    migrator.run(&mut conn, &Plan::apply_all()).await.unwrap();

    status_tx.send(AppStatus::Running)?;
    sd_notify::notify(false, &[sd_notify::NotifyState::Ready])?;
    info!("Migrations complete");

    Ok(())
}

async fn app_status_gate(
    State(status_rx): State<watch::Receiver<AppStatus>>,
    req: Request,
    next: Next,
) -> impl IntoResponse {
    // Combining the following 2 lines will anger the rust gods
    let status = status_rx.borrow().clone();
    match status {
        AppStatus::Running => next.run(req).await,
        AppStatus::Failed(reason) => {
            (StatusCode::INTERNAL_SERVER_ERROR, format!("App failed to start: {reason}"))
                .into_response()
        }
        AppStatus::Starting | AppStatus::Migrating => {
            (StatusCode::SERVICE_UNAVAILABLE, "Server not ready yet").into_response()
        }
    }
}

async fn auth_middleware(
    State(firebase_auth): State<Arc<FirebaseAuth>>,
    mut req: Request<axum::body::Body>,
    next: axum::middleware::Next,
) -> impl IntoResponse {
    match auth::authenticate_from_request(&firebase_auth, &req) {
        Ok(Some(user)) => {
            req.extensions_mut().insert(user);
        }
        Ok(_) => {}
        Err(err) => {
            error!("Authentication error: {err}");
        }
    }

    next.run(req).await
}

async fn status_handler(State(status_rx): State<watch::Receiver<AppStatus>>) -> String {
    match status_rx.borrow().clone() {
        AppStatus::Starting => "Starting".into(),
        AppStatus::Migrating => "Migrating".into(),
        AppStatus::Running => "Running".into(),
        AppStatus::Failed(reason) => format!("Failed: {reason}"),
    }
}

use axum::routing::get_service;
use tower_http::services::{ServeDir, ServeFile};

async fn run_web_server(
    state: app::AppState,
    firebase_auth: Arc<FirebaseAuth>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let port = web_port();
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await?;

    let rpc_router = rpc::router();
    let (qubit_service, qubit_handle) = rpc_router.to_service(state.clone());

    let rpc_with_mw = ServiceBuilder::new()
        .layer(from_fn_with_state(state.app_status.clone(), app_status_gate))
        .layer(from_fn_with_state(firebase_auth, auth_middleware))
        .service(qubit_service);

    // NOTE: Currently nothing is using the /status endpoint. It will likely be used in the future by
    // tests.
    let status_router = Router::new()
        .route("/status", get(status_handler))
        .with_state(state.app_status.clone());

    let mut app = Router::new().merge(status_router).nest_service("/rpc", rpc_with_mw);

    if let Some(spa_dir) = spa_directory() {
        let index = Path::new(&spa_dir).join("index.html");
        let spa_service =
            get_service(ServeDir::new(&spa_dir).not_found_service(ServeFile::new(index)));

        info!("Serving frontend from directory: {spa_dir}");
        app = app.nest_service("/", spa_service);
    } else {
        info!("frontend directory not found; keeping default text route at /");
        app = app.route("/", get(|| async { "Hello! The CatColab server is running" }));
    }

    app = app.layer(CorsLayer::permissive());

    info!("Web server listening at port {port}");

    axum::serve(listener, app).await?;
    qubit_handle.stop().ok();

    Ok(())
}

fn spa_directory() -> Option<String> {
    // NOTE: using an environment variable allows us to set the frontend at runtime, which will prevent
    // possible issues with circular dependencies in the future. (Currently the frontend dependency
    // catcolab-api, which is built by the backend, is tracked in git)
    if let Ok(candidate) = dotenvy::var("SPA_DIR") {
        let path = Path::new(&candidate);
        if path.exists() && path.is_dir() {
            return Some(candidate);
        }
    }
    None
}

async fn run_automerge_socket(
    io_layer: SocketIoLayer,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let port = automerge_io_port();
    let listener = tokio::net::TcpListener::bind(format!("localhost:{port}")).await?;
    let app = Router::new().layer(io_layer);
    info!("Automerge socket listening at port {port}");
    axum::serve(listener, app).await?;
    Ok(())
}
