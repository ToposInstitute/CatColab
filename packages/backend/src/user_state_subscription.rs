use std::collections::HashMap;
use std::sync::Arc;

use autosurgeon::{Text, hydrate, reconcile};
use chrono::{TimeZone, Utc};
use samod::DocumentId;
use serde::Deserialize;
use sqlx::postgres::PgListener;
use tokio::sync::RwLock;
use tracing::{debug, error, info};

use super::app::{AppError, AppState};
use crate::user_state::{DbPermission, DocInfo, UserState, get_or_create_user_state_doc};

/// A thread-safe, shared map of user IDs to their Automerge document IDs.
pub type UserStates = Arc<RwLock<HashMap<String, DocumentId>>>;

/// Notification from PostgreSQL about a user state change.
#[derive(Debug, Deserialize)]
#[serde(tag = "kind")]
enum UserStateNotification {
    /// A document was created, updated, or soft-deleted.
    /// The document should be upserted in the user's state.
    #[serde(rename = "upsert")]
    Upsert {
        user_id: String,
        ref_id: String,
        name: Option<String>,
        type_name: Option<String>,
        permissions: Option<Vec<DbPermission>>,
        created_at: Option<i64>,
        deleted_at: Option<i64>,
    },
    /// The user's permission on a document was revoked.
    /// The document should be removed from the user's state.
    #[serde(rename = "revoke")]
    Revoke { user_id: String, ref_id: String },
}

fn to_doc_info(notif: &UserStateNotification) -> Option<DocInfo> {
    match notif {
        UserStateNotification::Upsert {
            name,
            type_name,
            permissions,
            created_at,
            deleted_at,
            ..
        } => {
            let created_at = Utc.timestamp_millis_opt((*created_at)?).single()?;
            let deleted_at =
                deleted_at.as_ref().and_then(|ms| Utc.timestamp_millis_opt(*ms).single());

            let doc_permissions = permissions
                .as_ref()
                .map(|perms| perms.iter().filter_map(|p| p.to_permission_info()).collect())
                .unwrap_or_default();

            Some(DocInfo {
                name: Text::from(name.clone().unwrap_or_else(|| "untitled".to_string())),
                type_name: Text::from(type_name.clone()?),
                permissions: doc_permissions,
                created_at,
                deleted_at,
            })
        }
        _ => None,
    }
}

/// Handle a revoke notification by removing the document from the user's state.
fn handle_revoke(doc_handle: &samod::DocHandle, ref_id: &str) -> Result<(), AppError> {
    let result: Result<(), String> = doc_handle.with_document(|doc| {
        let mut user_state: UserState = hydrate(doc).map_err(|e| e.to_string())?;

        user_state.documents.remove(ref_id);
        doc.transact(|tx| reconcile(tx, &user_state)).map_err(|e| format!("{:?}", e))?;

        Ok(())
    });

    result.map_err(AppError::UserStateSync)
}

/// Handle an upsert notification by updating or creating the user's document.
fn handle_upsert(
    doc_handle: &samod::DocHandle,
    ref_id: &str,
    doc_info: DocInfo,
) -> Result<(), AppError> {
    let result: Result<(), String> = doc_handle.with_document(|doc| {
        let mut user_state: UserState = hydrate(doc).map_err(|e| e.to_string())?;

        user_state.documents.insert(ref_id.to_string(), doc_info);
        doc.transact(|tx| reconcile(tx, &user_state)).map_err(|e| format!("{:?}", e))?;

        Ok(())
    });

    result.map_err(AppError::UserStateSync)
}

/// Listen for Postgres notifications related to user state changes.
///
/// This subscription listens for changes to the DB and updates the affected user's Automerge
/// "user state" document.
pub async fn run_user_state_subscription(
    app_state: AppState,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut listener = PgListener::connect_with(&app_state.db).await?;
    listener.listen("user_state_subscription").await?;

    info!("Subscribed to Postgres notifications on channel 'user_state_subscription'");

    loop {
        let notification = listener.recv().await?;
        debug!(
            channel = notification.channel(),
            payload = notification.payload(),
            "Received Postgres notification"
        );

        match serde_json::from_str::<UserStateNotification>(notification.payload()) {
            Ok(notif) => match &notif {
                UserStateNotification::Upsert { user_id: uid, ref_id: rid, .. } => {
                    debug!(
                        user_id = %uid,
                        ref_id = %rid,
                        "Processing user state upsert notification"
                    );

                    let doc_info = to_doc_info(&notif).expect("Invalid upsert notification");
                    let result = async {
                        let doc_id = get_or_create_user_state_doc(&app_state, uid).await?;
                        let doc_handle = app_state.repo.find(doc_id).await?.ok_or(
                            AppError::UserStateSync("Could not get doc_handle".to_string()),
                        )?;
                        handle_upsert(&doc_handle, rid, doc_info)
                    }
                    .await;
                    if let Err(e) = result {
                        error!(
                            user_id = %uid,
                            ref_id = %rid,
                            error = %e,
                            "Failed to handle user state upsert"
                        );
                    }
                }
                UserStateNotification::Revoke { user_id: uid, ref_id: rid } => {
                    debug!(
                        user_id = %uid,
                        ref_id = %rid,
                        "Processing user state revocation notification"
                    );

                    let result = async {
                        let doc_id = {
                            let states = app_state.user_states.read().await;
                            states.get(uid.as_str()).cloned()
                        };
                        let Some(doc_id) = doc_id else {
                            debug!(
                                user_id = %uid,
                                ref_id = %rid,
                                "No cached document, nothing to remove"
                            );
                            return Ok(());
                        };
                        let doc_handle = app_state.repo.find(doc_id).await?.ok_or(
                            AppError::UserStateSync("Could not get doc_handle".to_string()),
                        )?;
                        handle_revoke(&doc_handle, rid)
                    }
                    .await;
                    if let Err(e) = result {
                        error!(
                            user_id = %uid,
                            ref_id = %rid,
                            error = %e,
                            "Failed to handle user state revocation"
                        );
                    }
                }
            },
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

#[cfg(all(test, feature = "property-tests"))]
mod tests {
    use autosurgeon::hydrate;
    use test_strategy::proptest;

    use super::*;
    use crate::user_state::UserState;
    use crate::user_state::arbitrary::arbitrary_user_state_with_id;

    /// Tests that incremental upserts via `handle_upsert` build up the expected
    /// user state, and that `handle_revoke` removes each entry correctly.
    #[proptest(cases = 16, async = "tokio")]
    async fn user_state_incremental_update_roundtrip(
        #[strategy(arbitrary_user_state_with_id())] user_id_and_state: (String, UserState),
    ) {
        let (_user_id, input_state) = user_id_and_state;
        if input_state.documents.is_empty() {
            return Ok(());
        }

        let repo = samod::Repo::build_tokio().load().await;
        let mut doc = automerge::Automerge::new();
        let empty_state = UserState { documents: HashMap::new() };
        doc.transact(|tx| autosurgeon::reconcile(tx, &empty_state))
            .map_err(|e| proptest::test_runner::TestCaseError::fail(format!("{:?}", e)))?;
        let doc_handle = repo.create(doc).await.unwrap();

        // Upsert entries one at a time and verify the final state.
        for (ref_id, doc_info) in &input_state.documents {
            handle_upsert(&doc_handle, ref_id, doc_info.clone())
                .map_err(|e| proptest::test_runner::TestCaseError::fail(e.to_string()))?;
        }

        let after_upserts: UserState =
            doc_handle.with_document(|doc| hydrate(doc).map_err(|e| e.to_string())).unwrap();
        proptest::prop_assert_eq!(&input_state, &after_upserts);

        // Revoke entries one at a time and verify the document empties.
        for ref_id in input_state.documents.keys() {
            handle_revoke(&doc_handle, ref_id)
                .map_err(|e| proptest::test_runner::TestCaseError::fail(e.to_string()))?;
        }

        let after_revokes: UserState =
            doc_handle.with_document(|doc| hydrate(doc).map_err(|e| e.to_string())).unwrap();
        proptest::prop_assert!(after_revokes.documents.is_empty());
    }
}
