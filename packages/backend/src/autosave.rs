//! Autosave listener that persists Automerge document changes to the database.

use std::time::Duration;

use crate::app::AppState;
use crate::document::create_snapshot;
use futures_util::stream::StreamExt;
use samod::DocHandle;
use uuid::Uuid;

const SNAPSHOT_DEBOUNCE_MS: u64 = 500;

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
            let mut snapshot_handle: Option<tokio::task::JoinHandle<()>> = None;

            while (changes.next().await).is_some() {
                if let Some(handle) = snapshot_handle.take() {
                    handle.abort();
                }
                let lock = state.snapshot_lock(ref_id).await;
                let _guard = match lock.try_lock() {
                    Ok(guard) => guard,
                    Err(_) => {
                        // we can't acquire the lock ignore this change
                        continue;
                    }
                };
                snapshot_handle = Some(tokio::spawn({
                    let state = state.clone();
                    async move {
                        tokio::time::sleep(Duration::from_millis(SNAPSHOT_DEBOUNCE_MS)).await;
                        let lock = state.snapshot_lock(ref_id).await;
                        let _guard = match lock.try_lock() {
                            Ok(guard) => guard,
                            Err(_) => {
                                // we can't acquire the lock ignore this change
                                return;
                            }
                        };
                        if let Err(e) = create_snapshot(state, ref_id).await {
                            tracing::error!("Snapshot failed for ref {}: {:?}", ref_id, e);
                        }
                    }
                }));
            }

            state.active_listeners.write().await.remove(&ref_id);
            tracing::error!("Autosave listener stopped for ref {}", ref_id);
        }
    });
}
