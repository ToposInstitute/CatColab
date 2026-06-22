//! Per-ref actor that coordinates changes to a document ref's state.

use std::time::Duration;

use crate::app::{AppError, AppState, RefMsg, RefReply};
use crate::document;
use futures_util::stream::StreamExt;
use samod::DocHandle;
use tokio::sync::mpsc;
use tokio::time::Instant;
use uuid::Uuid;

const SNAPSHOT_DEBOUNCE: Duration = Duration::from_millis(500);

/// Ensures a ref actor is running for the given ref, spawning one if needed.
pub async fn ensure_ref_actor(state: AppState, ref_id: Uuid, doc_handle: DocHandle) {
    let mut actors = state.ref_actors.write().await;
    if actors.contains_key(&ref_id) {
        return;
    }

    let (tx, rx) = mpsc::channel(8);
    actors.insert(ref_id, tx);
    drop(actors);

    tokio::spawn(run_ref_actor(state, ref_id, doc_handle, rx));
}

/// Gets the sender for the ref actor, starting one on demand if needed.
async fn get_or_start_actor(
    state: &AppState,
    ref_id: Uuid,
) -> Result<mpsc::Sender<(RefMsg, RefReply)>, AppError> {
    if let Some(tx) = state.ref_actors.read().await.get(&ref_id).cloned() {
        return Ok(tx);
    }

    let doc_id = document::get_doc_id(state.clone(), ref_id).await?;
    let doc_handle = state
        .repo
        .find(doc_id)
        .await?
        .ok_or_else(|| AppError::Invalid("Document not found".to_string()))?;

    ensure_ref_actor(state.clone(), ref_id, doc_handle).await;

    state
        .ref_actors
        .read()
        .await
        .get(&ref_id)
        .cloned()
        .ok_or_else(|| AppError::Invalid(format!("Failed to start ref actor for {ref_id}")))
}

/// Send a message to the ref actor for `ref_id`, starting one if needed.
pub async fn send_to_actor(state: &AppState, ref_id: Uuid, msg: RefMsg) -> Result<(), AppError> {
    let tx = get_or_start_actor(state, ref_id).await?;

    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();

    tx.send((msg, reply_tx))
        .await
        .map_err(|_| AppError::Invalid(format!("Ref actor for {ref_id} stopped")))?;

    reply_rx
        .await
        .map_err(|_| AppError::Invalid(format!("Ref actor for {ref_id} dropped reply")))?
}

/// The main actor loop for a single document ref.
async fn run_ref_actor(
    state: AppState,
    ref_id: Uuid,
    doc_handle: DocHandle,
    mut rx: mpsc::Receiver<(RefMsg, RefReply)>,
) {
    let mut changes = doc_handle.changes();
    let mut deadline: Option<Instant> = None;
    let mut skip_changes: u32 = 0;

    loop {
        let sleep = match deadline {
            Some(d) => tokio::time::sleep_until(d),
            None => tokio::time::sleep(Duration::MAX),
        };
        tokio::pin!(sleep);

        tokio::select! {
            biased;

            Some((msg, reply)) = rx.recv() => {
                let result = match msg {
                    RefMsg::CreateSnapshot => {
                        deadline = None;
                        document::create_snapshot(state.clone(), ref_id).await
                    }
                    RefMsg::LoadSnapshot { snapshot_id } => {
                        deadline = None;
                        skip_changes += 1;
                        document::load_snapshot(
                            &state, ref_id, snapshot_id, &doc_handle,
                        ).await
                    }
                    RefMsg::Delete => {
                        deadline = None;
                        document::delete_ref(state.clone(), ref_id).await
                    }
                    RefMsg::Restore => {
                        deadline = None;
                        document::restore_ref(state.clone(), ref_id).await
                    }
                };

                let _ = reply.send(result);
            }

            change = changes.next() => {
                if change.is_none() {
                    break;
                }

                if skip_changes > 0 {
                    skip_changes -= 1;
                    continue;
                }

                deadline = Some(Instant::now() + SNAPSHOT_DEBOUNCE);
            }

            _ = &mut sleep => {
                deadline = None;
                if let Err(e) = document::create_snapshot(state.clone(), ref_id).await {
                    tracing::error!("Autosave snapshot failed for ref {}: {:?}", ref_id, e);
                }
            }
        }
    }

    state.ref_actors.write().await.remove(&ref_id);
}
