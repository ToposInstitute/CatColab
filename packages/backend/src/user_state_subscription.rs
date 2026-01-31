use chrono::{DateTime, Utc};
use serde::Deserialize;
use sqlx::postgres::PgListener;
use tracing::{info, warn};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
enum Operation {
    Insert,
    Update,
    #[serde(other)]
    Other,
}

#[derive(Debug, Deserialize)]
struct RefsNotificationPayload {
    operation: Operation,
    ref_id: Uuid,
    head: i64,
    deleted_at: Option<DateTime<Utc>>,
}

/// Listen for Postgres notifications related to refs and log them.
///
/// This subscription listens for INSERT and UPDATE events on the refs table
/// and can be used to update user state Automerge documents when documents change.
pub async fn run_user_state_subscription(
    db: &sqlx::PgPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut listener = PgListener::connect_with(db).await?;
    listener.listen("refs_subscription").await?;

    info!("Subscribed to Postgres notifications on channel 'refs_subscription'");

    loop {
        let notification = listener.recv().await?;
        match serde_json::from_str::<RefsNotificationPayload>(notification.payload()) {
            Ok(payload) => {
                info!(
                    channel = notification.channel(),
                    payload = ?payload,
                    "Refs table event received"
                );

                // TODO: Update relevant user state Automerge documents based on the notification
                // This will involve:
                // 1. Looking up which users have access to the changed ref
                // 2. Updating their UserState Automerge documents accordingly
            }
            Err(error) => {
                warn!(
                    channel = notification.channel(),
                    payload = notification.payload(),
                    %error,
                    "Failed to parse refs notification payload"
                );
            }
        }
    }
}
