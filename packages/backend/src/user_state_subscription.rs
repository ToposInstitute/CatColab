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
use crate::user_state::{DbPermission, DocInfo, UserState, get_user_state_doc};

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
        theory: Option<String>,
        permissions: Option<Vec<DbPermission>>,
        created_at: Option<i64>,
        deleted_at: Option<i64>,
        parent: Option<uuid::Uuid>,
    },
    /// The user's permission on a document was revoked.
    /// The document should be removed from the user's state.
    #[serde(rename = "revoke")]
    Revoke { user_id: String, ref_id: String },
    /// The user's own profile (username or display_name) was updated.
    #[serde(rename = "profile_update")]
    ProfileUpdate {
        user_id: String,
        username: Option<String>,
        display_name: Option<String>,
    },
}

impl UserStateNotification {
    fn user_id(&self) -> &str {
        match self {
            UserStateNotification::Upsert { user_id, .. }
            | UserStateNotification::Revoke { user_id, .. }
            | UserStateNotification::ProfileUpdate { user_id, .. } => user_id,
        }
    }
}

fn to_doc_info(notif: &UserStateNotification) -> Option<DocInfo> {
    match notif {
        UserStateNotification::Upsert {
            name,
            type_name,
            theory,
            permissions,
            created_at,
            deleted_at,
            parent,
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
                type_name: type_name.clone()?,
                theory: theory.clone(),
                permissions: doc_permissions,
                created_at,
                deleted_at,
                parent: *parent,
                // Children are recomputed after every mutation.
                children: Vec::new(),
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
        user_state.recompute_children();
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
        user_state.recompute_children();
        doc.transact(|tx| reconcile(tx, &user_state)).map_err(|e| format!("{:?}", e))?;

        Ok(())
    });

    result.map_err(AppError::UserStateSync)
}

/// Handle a profile update notification by updating the user's profile in their state doc.
fn handle_profile_update(
    doc_handle: &samod::DocHandle,
    user_id: &str,
    username: Option<String>,
    display_name: Option<String>,
) -> Result<(), AppError> {
    let result: Result<(), String> = doc_handle.with_document(|doc| {
        let mut user_state: UserState = hydrate(doc).map_err(|e| e.to_string())?;

        user_state.profile = crate::user_state::UserInfo {
            id: user_id.to_string(),
            username: username.map(Text::from),
            display_name: display_name.map(Text::from),
        };
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
            Ok(notif) => {
                let uid = notif.user_id();
                let doc_id = get_user_state_doc(&app_state, uid).await;
                if doc_id.is_none() {
                    debug!(user_id = %uid, "No cached UserState, nothing to update");
                    continue;
                }
                let doc_id = doc_id.expect("Cached document should exist");
                let doc_handle = app_state
                    .repo
                    .find(doc_id)
                    .await?
                    .ok_or(AppError::UserStateSync("Could not get doc_handle".to_string()))?;
                match &notif {
                    UserStateNotification::Upsert { user_id: uid, ref_id: rid, .. } => {
                        debug!(
                            user_id = %uid,
                            ref_id = %rid,
                            "Processing user state upsert notification"
                        );

                        let doc_info = to_doc_info(&notif).expect("Invalid upsert notification");
                        let result = handle_upsert(&doc_handle, rid, doc_info);
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

                        let result = handle_revoke(&doc_handle, rid);
                        if let Err(e) = result {
                            error!(
                                user_id = %uid,
                                ref_id = %rid,
                                error = %e,
                                "Failed to handle user state revocation"
                            );
                        }
                    }
                    UserStateNotification::ProfileUpdate {
                        user_id: uid,
                        username,
                        display_name,
                    } => {
                        debug!(
                            user_id = %uid,
                            "Processing user state profile update notification"
                        );

                        let result = handle_profile_update(
                            &doc_handle,
                            uid,
                            username.clone(),
                            display_name.clone(),
                        );
                        if let Err(e) = result {
                            error!(
                                user_id = %uid,
                                error = %e,
                                "Failed to handle user state profile update"
                            );
                        }
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
        let (user_id, input_state) = user_id_and_state;
        if input_state.documents.is_empty() {
            return Ok(());
        }

        let repo = samod::Repo::build_tokio().load().await;
        let mut doc = automerge::Automerge::new();
        let empty_state = UserState::new(&user_id);
        doc.transact(|tx| autosurgeon::reconcile(tx, &empty_state))
            .map_err(|e| proptest::test_runner::TestCaseError::fail(format!("{:?}", e)))?;
        let doc_handle = repo.create(doc).await.unwrap();

        // Apply profile update, then upsert entries one at a time.
        handle_profile_update(
            &doc_handle,
            &user_id,
            input_state.profile.username.as_ref().map(|t| t.as_str().to_string()),
            input_state.profile.display_name.as_ref().map(|t| t.as_str().to_string()),
        )
        .map_err(|e| proptest::test_runner::TestCaseError::fail(e.to_string()))?;

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
