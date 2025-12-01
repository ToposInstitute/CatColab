use axum::{
    extract::{State, ws::WebSocketUpgrade},
    response::{IntoResponse, Json},
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;
use tracing::info;

type DocumentId = Arc<RwLock<Option<String>>>;

#[derive(Serialize, Deserialize)]
struct DocIdResponse {
    doc_id: String,
}

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive(tracing::Level::INFO.into()),
        )
        .init();

    // Create samod repo
    let repo = samod::Repo::builder(tokio::runtime::Handle::current())
        .with_storage(samod::storage::InMemoryStorage::new())
        .load()
        .await;

    // Create initial document
    let mut initial_doc = automerge::Automerge::new();
    initial_doc
        .transact(|tx| {
            use automerge::transaction::Transactable;
            tx.put(automerge::ROOT, "message", "Hello from Rust backend!")?;
            tx.put(automerge::ROOT, "count", 0)?;
            Ok::<_, automerge::AutomergeError>(())
        })
        .expect("Failed to create initial document");

    let doc_handle = repo
        .create(initial_doc)
        .await
        .expect("Failed to create document in repo");

    let doc_id = doc_handle.document_id().to_string();
    info!("Created document with ID: {}", doc_id);

    // Store doc ID in shared state
    let doc_id_state = Arc::new(RwLock::new(Some(doc_id.clone())));

    // Build application
    let app = Router::new()
        .route("/doc-id", get(get_doc_id))
        .route("/repo-ws", get(websocket_handler))
        .layer(CorsLayer::permissive())
        .with_state((repo, doc_id_state));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080")
        .await
        .expect("Failed to bind to port 8080");

    info!("Server listening on http://localhost:8080");
    info!("Document ID endpoint: http://localhost:8080/doc-id");
    info!("WebSocket endpoint: ws://localhost:8080/repo-ws");

    axum::serve(listener, app)
        .await
        .expect("Server error");
}

async fn get_doc_id(
    State((_, doc_id)): State<(samod::Repo, DocumentId)>,
) -> impl IntoResponse {
    let doc_id = doc_id.read().await;
    if let Some(id) = doc_id.as_ref() {
        Json(DocIdResponse {
            doc_id: id.clone(),
        })
    } else {
        Json(DocIdResponse {
            doc_id: "No document created yet".to_string(),
        })
    }
}

async fn websocket_handler(
    ws: WebSocketUpgrade,
    State((repo, _)): State<(samod::Repo, DocumentId)>,
) -> axum::response::Response {
    ws.on_upgrade(|socket| async move {
        repo.accept_axum(socket).await;
    })
}
