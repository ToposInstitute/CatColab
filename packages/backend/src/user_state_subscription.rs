use std::collections::HashMap;
use std::sync::Arc;

use autosurgeon::reconcile;
use samod::DocumentId;
use serde::Deserialize;
use sqlx::postgres::PgListener;
use tokio::sync::RwLock;
use tracing::{error, info};

use crate::app::AppState;
use crate::user_state::read_user_state_from_db;

/// A thread-safe, shared map of user IDs to their Automerge document IDs.
pub type UserStates = Arc<RwLock<HashMap<String, DocumentId>>>;

#[derive(Debug, Deserialize)]
struct UserStateNotificationPayload {
    user_id: String,
}

/// Listen for Postgres notifications related to user state changes.
///
/// This subscription listens for changes to refs and permissions tables,
/// then updates the affected user's Automerge document with their complete state.
pub async fn run_user_state_subscription(
    app_state: AppState,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut listener = PgListener::connect_with(&app_state.db).await?;
    listener.listen("user_state_subscription").await?;

    info!("Subscribed to Postgres notifications on channel 'user_state_subscription'");

    loop {
        let notification = listener.recv().await?;
        info!(channel = notification.channel(), payload = notification.payload(), "Received Postgres notification");
        match serde_json::from_str::<UserStateNotificationPayload>(notification.payload()) {
            Ok(payload) => {
                let user_id = payload.user_id;

                // Small delay to ensure the triggering transaction has committed
                // Using 200ms to give ample time for transaction to commit
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;

                match read_user_state_from_db(user_id.clone(), &app_state.db).await {
                    Ok(user_state) => {
                        // Get or create the document for this user
                        let doc_id = {
                            let states = app_state.user_states.read().await;
                            states.get(&user_id).cloned()
                        };

                        match doc_id {
                            Some(doc_id) => {
                                // Update existing document
                                match app_state.repo.find(doc_id.clone()).await {
                                    Ok(Some(doc_handle)) => {
                                        let (peers, _) = doc_handle.peers();
                                        info!(
                                            user_id = %user_id,
                                            doc_count = user_state.documents.len(),
                                            peer_count = peers.len(),
                                            "Reconciling user state"
                                        );
                                        let (heads_before, heads_after) = doc_handle.with_document(|doc| {
                                            let heads_before = doc.get_heads();
                                            let result = doc.transact(|tx| {
                                                reconcile(tx, &user_state).map_err(|e| {
                                                    automerge::AutomergeError::InvalidObjId(
                                                        e.to_string(),
                                                    )
                                                })?;
                                                Ok::<_, automerge::AutomergeError>(())
                                            });
                                            let heads_after = doc.get_heads();
                                            if let Err(e) = result {
                                                error!(
                                                    user_id = %user_id,
                                                    error = ?e,
                                                    "Failed to reconcile user state"
                                                );
                                            }
                                            (heads_before, heads_after)
                                        });
                                        info!(
                                            user_id = %user_id,
                                            heads_changed = heads_before != heads_after,
                                            "Reconcile succeeded"
                                        );
                                    }
                                    Ok(None) => {
                                        // Create a new document
                                        if let Err(e) =
                                            create_user_state_doc(&app_state, &user_id, &user_state)
                                                .await
                                        {
                                            error!(
                                                user_id = %user_id,
                                                error = %e,
                                                "Failed to create new user state document"
                                            );
                                        }
                                    }
                                    Err(e) => {
                                        error!(
                                            user_id = %user_id,
                                            error = %e,
                                            "Failed to find user state document"
                                        );
                                    }
                                }
                            }
                            None => {
                                // Create new document for this user
                                if let Err(e) =
                                    create_user_state_doc(&app_state, &user_id, &user_state).await
                                {
                                    error!(
                                        user_id = %user_id,
                                        error = %e,
                                        "Failed to create user state document"
                                    );
                                }
                            }
                        }
                    }
                    Err(e) => {
                        error!(
                            user_id = %user_id,
                            error = %e,
                            "Failed to read user state from database"
                        );
                    }
                }
            }
            Err(error) => {
                error!(
                    channel = notification.channel(),
                    payload = notification.payload(),
                    %error,
                    "Failed to parse user state notification payload"
                );
            }
        }
    }
}

/// Gets or creates the user state document for a given user.
///
/// This function reads the user's current state from the database and either:
/// - Returns the existing document ID if already cached
/// - Creates a new document with the current DB state if not cached
///
/// This is useful for initializing a user's state when they first connect,
/// before any notifications have been received.
pub async fn get_or_create_user_state_doc(
    state: &AppState,
    user_id: &str,
) -> Result<DocumentId, crate::app::AppError> {
    // Check if we already have a document for this user
    {
        let states = state.user_states.read().await;
        if let Some(doc_id) = states.get(user_id) {
            return Ok(doc_id.clone());
        }
    }

    // Read current state from database (empty if user has no documents)
    let user_state = read_user_state_from_db(user_id.to_string(), &state.db).await?;

    // Create the document
    create_user_state_doc(state, user_id, &user_state).await
}

/// Creates a new user state document in samod and registers it in the user states map.
async fn create_user_state_doc(
    state: &AppState,
    user_id: &str,
    user_state: &crate::user_state::UserState,
) -> Result<DocumentId, crate::app::AppError> {
    let mut doc = automerge::Automerge::new();
    doc.transact(|tx| {
        reconcile(tx, user_state)
            .map_err(|e| automerge::AutomergeError::InvalidObjId(e.to_string()))?;
        Ok::<_, automerge::AutomergeError>(())
    })
    .map_err(|e| {
        crate::app::AppError::Invalid(format!("Failed to reconcile UserState: {:?}", e))
    })?;

    let doc_handle = state.repo.create(doc).await?;
    let doc_id = doc_handle.document_id().clone();

    // Store the document ID in the user states map
    let mut states = state.user_states.write().await;
    states.insert(user_id.to_string(), doc_id.clone());

    info!(user_id = %user_id, doc_id = %doc_id, "Created user state document");

    Ok(doc_id)
}
