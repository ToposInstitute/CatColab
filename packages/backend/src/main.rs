use axum::extract::Request;

use axum::extract::ws::WebSocketUpgrade;
use axum::middleware::{Next, from_fn_with_state};
use axum::{Router, routing::get};
use axum::{extract::State, response::IntoResponse};
use clap::{Parser, Subcommand};
use firebase_auth::FirebaseAuth;
use http::StatusCode;
use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Postgres};
use sqlx_migrator::cli::MigrationCommand;
use sqlx_migrator::migrator::{Migrate, Migrator};
use sqlx_migrator::{Info, Plan};
use std::collections::HashSet;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::{RwLock, watch};
use tower::ServiceBuilder;
use tower_http::cors::CorsLayer;
use tracing::{error, info};
use tracing_subscriber::filter::{EnvFilter, LevelFilter};

mod app;
mod auth;
mod automerge_json;
mod document;
mod rpc;
mod user;

use app::AppStatus;

/// Port for the web server providing the RPC API.
fn web_port() -> String {
    dotenvy::var("PORT").unwrap_or("8000".to_string())
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
    /// Generate TypeScript bindings for the RPC API
    GenerateBindings,
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

        Command::GenerateBindings => {
            use qubit::TypeScript;

            let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("pkg")
                .join("src")
                .join("index.ts");

            rpc::router()
                .as_codegen()
                .write_type(&path, TypeScript::new())
                .expect("Failed to write TypeScript bindings");

            info!("Successfully generated TypeScript bindings to: {}", path.display());
            return;
        }

        Command::Serve => {
            let (status_tx, status_rx) = watch::channel(AppStatus::Starting);

            // Create samod repo
            let repo = samod::Repo::builder(tokio::runtime::Handle::current())
                .with_storage(samod::storage::InMemoryStorage::new())
                .load()
                .await;

            let state = app::AppState {
                db: db.clone(),
                app_status: status_rx.clone(),
                repo,
                active_listeners: Arc::new(RwLock::new(HashSet::new())),
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

            tokio::try_join!(
                run_migrator_apply(db.clone(), migrator, status_tx.clone()),
                run_web_server(state.clone(), firebase_auth.clone()),
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

async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(repo): State<samod::Repo>,
) -> axum::response::Response {
    ws.on_upgrade(|socket| async move {
        repo.accept_axum(socket).expect("Failed to accept WebSocket connection");
    })
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
    let (qubit_service, qubit_handle) = rpc_router.as_rpc(state.clone()).into_service();

    let rpc_with_mw = ServiceBuilder::new()
        .layer(from_fn_with_state(state.app_status.clone(), app_status_gate))
        .layer(from_fn_with_state(firebase_auth.clone(), auth_middleware))
        .service(qubit_service);

    let samod_router = Router::new()
        .layer(from_fn_with_state(firebase_auth, auth_middleware))
        .layer(from_fn_with_state(state.app_status.clone(), app_status_gate))
        .route("/repo-ws", get(websocket_handler))
        .with_state(state.repo.clone());

    // used by tests to tell when the backend is ready
    let status_router = Router::new()
        .route("/status", get(status_handler))
        .with_state(state.app_status.clone());

    let mut app = Router::new()
        .merge(status_router)
        .nest_service("/rpc", rpc_with_mw)
        .merge(samod_router);

    if let Some(spa_dir) = spa_directory() {
        let index = Path::new(&spa_dir).join("index.html");
        let spa_service =
            get_service(ServeDir::new(&spa_dir).not_found_service(ServeFile::new(index)));

        info!("Serving frontend from directory: {spa_dir}");
        app = app.fallback_service(spa_service);
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
