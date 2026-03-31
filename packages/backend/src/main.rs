//! Main entry point for the CatColab backend.

use axum::extract::Request;
use axum::extract::ws::WebSocketUpgrade;
use axum::middleware::from_fn_with_state;
use axum::{Router, routing::get};
use axum::{extract::State, response::IntoResponse};
use clap::{Parser, Subcommand};
use firebase_auth::{FirebaseAuth, FirebaseUser}; // FirebaseUser used by julia_proxy_handler
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

use backend::{app, auth, rpc, storage, user_state};

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

    let cli = Cli::parse();

    if let Some(Command::GenerateBindings) = cli.command {
        use qubit::TypeScript;
        use ts_rs::TS;

        let pkg_src_path =
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("pkg").join("src");

        std::fs::create_dir_all(&pkg_src_path)
            .expect("Failed to create directory for TypeScript bindings");

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

    let db = PgPoolOptions::new()
        .max_connections(10)
        .connect(&dotenvy::var("DATABASE_URL").expect("`DATABASE_URL` should be set"))
        .await
        .expect("Failed to connect to database");

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

        Command::GenerateBindings => unreachable!(),

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

            let port = web_port();
            let ws_listener_url = samod::Url::parse(&format!("ws://0.0.0.0:{port}/repo-ws"))
                .expect("valid WebSocket listener URL for samod");
            let repo_acceptor = repo.make_acceptor(ws_listener_url).expect("samod make_acceptor");

            let http_client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(120))
                .build()
                .expect("Failed to build HTTP client");
            let julia_url = dotenvy::var("JULIA_URL").ok();
            if let Some(ref url) = julia_url {
                info!("Julia compute server configured at: {url}");
            } else {
                info!("Julia compute server not configured (JULIA_URL not set)");
            }

            let state = app::AppState {
                db: db.clone(),
                repo,
                active_listeners: Arc::new(RwLock::new(HashSet::new())),
                suppress_autosave: Arc::new(RwLock::new(HashSet::new())),
                initialized_user_states: Arc::new(RwLock::new(HashMap::new())),
                http_client,
                julia_url,
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

            run_web_server(state.clone(), repo_acceptor, firebase_auth.clone())
                .await
                .unwrap();
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
    State(acceptor): State<samod::AcceptorHandle>,
) -> axum::response::Response {
    ws.on_upgrade(|socket| async move {
        acceptor.accept_axum(socket).expect("Failed to accept WebSocket connection");
    })
}

/// Maximum request body size for Julia proxy requests (100 MB).
const JULIA_PROXY_MAX_BODY: usize = 100 * 1024 * 1024;

async fn julia_proxy_handler(
    State(state): State<app::AppState>,
    user: Option<axum::Extension<FirebaseUser>>,
    axum::extract::Path(path): axum::extract::Path<String>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    if user.is_none() {
        return (axum::http::StatusCode::UNAUTHORIZED, "Authentication required").into_response();
    }

    let julia_url = match &state.julia_url {
        Some(url) => url,
        None => {
            return (
                axum::http::StatusCode::SERVICE_UNAVAILABLE,
                "Julia compute service is not configured",
            )
                .into_response();
        }
    };

    if body.len() > JULIA_PROXY_MAX_BODY {
        return (axum::http::StatusCode::PAYLOAD_TOO_LARGE, "Request body too large")
            .into_response();
    }

    let url = format!("{julia_url}/{path}");
    let result = state
        .http_client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await;

    match result {
        Ok(resp) => {
            let status = axum::http::StatusCode::from_u16(resp.status().as_u16())
                .unwrap_or(axum::http::StatusCode::BAD_GATEWAY);
            let content_type = resp.headers().get("content-type").cloned();
            match resp.bytes().await {
                Ok(body) => {
                    let mut response = (status, body).into_response();
                    if let Some(ct) = content_type {
                        response.headers_mut().insert("content-type", ct);
                    }
                    response
                }
                Err(_) => (
                    axum::http::StatusCode::BAD_GATEWAY,
                    "Failed to read response from Julia service",
                )
                    .into_response(),
            }
        }
        Err(err) => {
            if err.is_timeout() {
                (axum::http::StatusCode::GATEWAY_TIMEOUT, "Julia service timed out").into_response()
            } else {
                error!("Julia proxy error: {err}");
                (axum::http::StatusCode::BAD_GATEWAY, "Failed to connect to Julia service")
                    .into_response()
            }
        }
    }
}

use axum::routing::get_service;
use tower_http::services::{ServeDir, ServeFile};

async fn run_web_server(
    state: app::AppState,
    repo_acceptor: samod::AcceptorHandle,
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
        .layer(from_fn_with_state(firebase_auth.clone(), auth_middleware))
        .route("/repo-ws", get(websocket_handler))
        .with_state(repo_acceptor);

    let julia_router = Router::new()
        .route("/julia/{*path}", axum::routing::post(julia_proxy_handler))
        .layer(from_fn_with_state(firebase_auth, auth_middleware))
        .with_state(state.clone());

    // used by tests to tell when the backend is ready
    let status_router = Router::new().route("/status", get(status_handler));

    let mut app = Router::new()
        .merge(status_router)
        .nest_service("/rpc", rpc_with_mw)
        .merge(samod_router)
        .merge(julia_router);

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

    app = app.layer(CorsLayer::very_permissive());

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
