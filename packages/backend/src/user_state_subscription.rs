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
    state: AppState,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut listener = PgListener::connect_with(&state.db).await?;
    listener.listen("user_state_subscription").await?;

    info!("Subscribed to Postgres notifications on channel 'user_state_subscription'");

    loop {
        let notification = listener.recv().await?;
        match serde_json::from_str::<UserStateNotificationPayload>(notification.payload()) {
            Ok(payload) => {
                let user_id = payload.user_id;

                // Read the complete user state from the database
                match read_user_state_from_db(user_id.clone(), &state.db).await {
                    Ok(user_state) => {
                        // Get or create the document for this user
                        let doc_id = {
                            let states = state.user_states.read().await;
                            states.get(&user_id).cloned()
                        };

                        match doc_id {
                            Some(doc_id) => {
                                // Update existing document
                                match state.repo.find(doc_id.clone()).await {
                                    Ok(Some(doc_handle)) => {
                                        let result = doc_handle.with_document(|doc| {
                                            doc.transact(|tx| {
                                                reconcile(tx, &user_state).map_err(|e| {
                                                    automerge::AutomergeError::InvalidObjId(e.to_string())
                                                })?;
                                                Ok::<_, automerge::AutomergeError>(())
                                            })
                                        });
                                        match result {
                                            Ok(_) => {
                                                info!(user_id = %user_id, doc_id = %doc_id, "Updated user state document");
                                            }
                                            Err(e) => {
                                                error!(
                                                    user_id = %user_id,
                                                    error = ?e,
                                                    "Failed to reconcile user state"
                                                );
                                            }
                                        }
                                    }
                                    Ok(None) => {
                                        error!(
                                            user_id = %user_id,
                                            doc_id = %doc_id,
                                            "User state document not found, creating new one"
                                        );
                                        // Create a new document since the old one is missing
                                        if let Err(e) = create_user_state_doc(&state, &user_id, &user_state).await {
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
                                if let Err(e) = create_user_state_doc(&state, &user_id, &user_state).await {
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

/// Creates a new user state document in samod and registers it in the user states map.
async fn create_user_state_doc(
    state: &AppState,
    user_id: &str,
    user_state: &crate::user_state::UserState,
) -> Result<DocumentId, crate::app::AppError> {
    let mut doc = automerge::Automerge::new();
    doc.transact(|tx| {
        reconcile(tx, user_state).map_err(|e| {
            automerge::AutomergeError::InvalidObjId(e.to_string())
        })?;
        Ok::<_, automerge::AutomergeError>(())
    })
    .map_err(|e| crate::app::AppError::Invalid(format!("Failed to reconcile UserState: {:?}", e)))?;

    let doc_handle = state.repo.create(doc).await?;
    let doc_id = doc_handle.document_id().clone();

    // Store the document ID in the user states map
    let mut states = state.user_states.write().await;
    states.insert(user_id.to_string(), doc_id.clone());

    info!(user_id = %user_id, doc_id = %doc_id, "Created user state document");

    Ok(doc_id)
}
