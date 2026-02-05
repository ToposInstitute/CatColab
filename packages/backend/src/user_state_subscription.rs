use std::collections::HashMap;
use std::sync::Arc;

use automerge::Automerge;
use serde::Deserialize;
use sqlx::postgres::PgListener;
use tokio::sync::RwLock;
use tracing::{error, info};

use crate::app::AppState;
use crate::user_state::{read_user_state_from_db, user_state_to_automerge};

/// A thread-safe, shared map of user IDs to their Automerge documents.
pub type UserStates = Arc<RwLock<HashMap<String, Automerge>>>;

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
                        // Convert to Automerge document
                        match user_state_to_automerge(&user_state) {
                            Ok(doc) => {
                                // Update the shared map
                                let mut states = state.user_states.write().await;
                                states.insert(user_id.clone(), doc);
                                info!(user_id = %user_id, "Updated user state Automerge document");
                            }
                            Err(e) => {
                                error!(
                                    user_id = %user_id,
                                    error = %e,
                                    "Failed to convert user state to Automerge"
                                );
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
