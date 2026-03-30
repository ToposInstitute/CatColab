//! Autosave listener that persists Automerge document changes to the database.

use crate::app::AppState;
use crate::document::{RefContent, autosave};
use futures_util::stream::StreamExt;
use notebook_types::automerge_json::hydrate_to_json;
use samod::DocHandle;
use uuid::Uuid;

/// Spawns a background task that listens for document changes and triggers autosave.
pub async fn ensure_autosave_listener(state: AppState, ref_id: Uuid, doc_handle: DocHandle) {
    let listeners = state.active_listeners.read().await;
    if listeners.contains(&ref_id) {
        return;
    }

    // Explicitly drop the read lock before acquiring write lock
    drop(listeners);

    let mut listeners = state.active_listeners.write().await;
    listeners.insert(ref_id);

    tokio::spawn({
        let state = state.clone();
        async move {
            let mut changes = doc_handle.changes();

            while (changes.next().await).is_some() {
                let (hydrated, heads) = doc_handle.with_document(|doc| {
                    let heads: Vec<Vec<u8>> =
                        doc.get_heads().iter().map(|h| h.0.to_vec()).collect();
                    (doc.hydrate(None), heads)
                });
                let content = hydrate_to_json(&hydrated);

                let data = RefContent { ref_id, content, heads };
                if let Err(e) = autosave(state.clone(), data).await {
                    tracing::error!("Autosave failed for ref {}: {:?}", ref_id, e);
                }
            }

            state.active_listeners.write().await.remove(&ref_id);
            tracing::error!("Autosave listener stopped for ref {}", ref_id);
        }
    });
}
