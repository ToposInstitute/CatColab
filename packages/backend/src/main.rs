//! Main entry point for the CatColab backend.

use axum::extract::Request;
use axum::extract::ws::WebSocketUpgrade;
use axum::middleware::from_fn_with_state;
use axum::{Router, routing::get};
use axum::{extract::State, response::IntoResponse};
use clap::{Parser, Subcommand};
use firebase_auth::FirebaseAuth;
use sqlx::postgres::PgPoolOptions;
use sqlx_migrator::cli::MigrationCommand;
use sqlx_migrator::migrator::{Migrate, Migrator};
use sqlx_migrator::{Info, Plan};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower::ServiceBuilder;
use tower_http::cors::CorsLayer;
use tracing::{error, info};
use tracing_subscriber::filter::{EnvFilter, LevelFilter};

mod app;
mod auth;
mod automerge_json;
mod document;
mod rpc;
mod storage;
mod user;
mod user_state;
mod user_state_subscription;

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
    /// Run database migrations (proxied to sqlx_migrator).
    Migrator(MigrationCommand),
    /// Start the web server (default).
    Serve,
    /// Generate TypeScript bindings for the RPC API.
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
            use ts_rs::TS;

            let pkg_src_path =
                std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("pkg").join("src");

            let index_path = pkg_src_path.join("index.ts");

            rpc::router()
                .as_codegen()
                .write_type(&index_path, TypeScript::new())
                .expect("Failed to write TypeScript bindings");

            info!("Successfully generated qubit TypeScript bindings to: {}", index_path.display());

            user_state::UserState::export_all_to(&pkg_src_path)
                .expect("Failed to export ts-rs bindings");
            info!("Successfully exported ts-rs TypeScript bindings to: {}", pkg_src_path.display());

            return;
        }

        Command::Serve => {
            info!("Applying database migrations...");
            let mut conn = db.acquire().await.expect("Failed to acquire DB connection");
            migrator
                .run(&mut conn, &Plan::apply_all())
                .await
                .expect("Failed to run migrations");
            info!("Migrations complete");

            let repo = samod::Repo::builder(tokio::runtime::Handle::current())
                .with_storage(storage::PostgresStorage::new(db.clone()))
                .with_announce_policy(|_doc_id, _peer_id| false)
                .load()
                .await;

            let state = app::AppState {
                db: db.clone(),
                repo,
                active_listeners: Arc::new(RwLock::new(HashSet::new())),
                user_states: Arc::new(RwLock::new(HashMap::new())),
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

            // Notify systemd we're ready
            sd_notify::notify(false, &[sd_notify::NotifyState::Ready]).ok();

            let web_server = run_web_server(state.clone(), firebase_auth.clone());
            let subscription = user_state_subscription::run_user_state_subscription(state.clone());

            tokio::select! {
                result = web_server => {
                    result.expect("Web server failed");
                }
                result = subscription => {
                    result.expect("User state subscription failed");
                }
            }
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

async fn status_handler() -> &'static str {
    "Running"
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
        .layer(from_fn_with_state(firebase_auth.clone(), auth_middleware))
        .service(qubit_service);

    let samod_router = Router::new()
        .layer(from_fn_with_state(firebase_auth, auth_middleware))
        .route("/repo-ws", get(websocket_handler))
        .with_state(state.repo.clone());

    // used by tests to tell when the backend is ready
    let status_router = Router::new().route("/status", get(status_handler));

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
