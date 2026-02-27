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
use crate::user_state::{DbPermission, DbUserInfo, DocInfo, UserState, get_user_state_doc};

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
        #[serde(default)]
        users: Option<HashMap<String, DbUserInfo>>,
        created_at: Option<i64>,
        deleted_at: Option<i64>,
        parent: Option<uuid::Uuid>,
    },
    /// The user's permission on a document was revoked.
    /// The document should be removed from the user's state.
    #[serde(rename = "revoke")]
    Revoke { user_id: String, ref_id: String },
    /// A user's profile (username or display_name) was updated.
    /// The Rust handler updates the user's own profile and the `users` map
    /// entry in all other users' state docs that reference this user.
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

/// Extracts a `DocInfo` and a map of user entries from an upsert notification.
fn to_doc_info(
    notif: &UserStateNotification,
) -> Option<(DocInfo, HashMap<String, crate::user_state::UserInfo>)> {
    match notif {
        UserStateNotification::Upsert {
            name,
            type_name,
            theory,
            permissions,
            users: notif_users,
            created_at,
            deleted_at,
            parent,
            ..
        } => {
            let created_at = Utc.timestamp_millis_opt((*created_at)?).single()?;
            let deleted_at =
                deleted_at.as_ref().and_then(|ms| Utc.timestamp_millis_opt(*ms).single());

            let users: HashMap<String, crate::user_state::UserInfo> = notif_users
                .as_ref()
                .map(|u| u.iter().map(|(id, info)| (id.clone(), info.to_user_info())).collect())
                .unwrap_or_default();
            let doc_permissions = permissions
                .as_ref()
                .map(|perms| perms.iter().filter_map(|p| p.to_permission_info()).collect())
                .unwrap_or_default();

            Some((
                DocInfo {
                    name: Text::from(name.clone().unwrap_or_else(|| "untitled".to_string())),
                    type_name: type_name.clone()?,
                    theory: theory.clone(),
                    permissions: doc_permissions,
                    created_at,
                    deleted_at,
                    parent: *parent,
                    // Children are recomputed after every mutation.
                    children: Vec::new(),
                },
                users,
            ))
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
    new_users: HashMap<String, crate::user_state::UserInfo>,
) -> Result<(), AppError> {
    let result: Result<(), String> = doc_handle.with_document(|doc| {
        let mut user_state: UserState = hydrate(doc).map_err(|e| e.to_string())?;

        user_state.documents.insert(ref_id.to_string(), doc_info);
        user_state.users.extend(new_users);
        user_state.recompute_children();
        doc.transact(|tx| reconcile(tx, &user_state)).map_err(|e| format!("{:?}", e))?;

        Ok(())
    });

    result.map_err(AppError::UserStateSync)
}

/// Update a single user state doc with new user info.
///
/// If `updated_user_id` matches the doc owner, updates `profile`.
/// Otherwise, updates the `users` map entry if it exists.
fn apply_profile_update(
    doc_handle: &samod::DocHandle,
    is_self: bool,
    updated_user_id: &str,
    info: crate::user_state::UserInfo,
) -> Result<(), AppError> {
    let result: Result<(), String> = doc_handle.with_document(|doc| {
        let mut user_state: UserState = hydrate(doc).map_err(|e| e.to_string())?;

        if is_self {
            user_state.profile = info;
        } else if user_state.users.contains_key(updated_user_id) {
            user_state.users.insert(updated_user_id.to_string(), info);
        } else {
            return Ok(());
        }

        doc.transact(|tx| reconcile(tx, &user_state)).map_err(|e| format!("{:?}", e))?;
        Ok(())
    });

    result.map_err(AppError::UserStateSync)
}

/// Handle a profile update notification.
///
/// Updates the user's own profile in their state doc, and updates the `users`
/// map entry for this user in all other cached user state docs.
async fn handle_profile_update(
    user_id: &str,
    username: Option<String>,
    display_name: Option<String>,
    user_states: &UserStates,
    app_state: &AppState,
) -> Result<(), AppError> {
    let info = crate::user_state::UserInfo {
        username: username.map(Text::from),
        display_name: display_name.map(Text::from),
    };

    let states = user_states.read().await;

    for (state_owner_id, doc_id) in states.iter() {
        let doc_handle = match app_state.repo.find(doc_id.clone()).await {
            Ok(Some(handle)) => handle,
            _ => continue,
        };

        let is_self = state_owner_id == user_id;
        if let Err(e) = apply_profile_update(&doc_handle, is_self, user_id, info.clone()) {
            error!(
                user_id = %state_owner_id,
                updated_user = %user_id,
                error = %e,
                "Failed to update user info in state doc"
            );
        }
    }

    Ok(())
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
                match &notif {
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
                            uid,
                            username.clone(),
                            display_name.clone(),
                            &app_state.user_states,
                            &app_state,
                        )
                        .await;
                        if let Err(e) = result {
                            error!(
                                user_id = %uid,
                                error = %e,
                                "Failed to handle user state profile update"
                            );
                        }
                    }
                    _ => {
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
                            .ok_or(AppError::UserStateSync(
                                "Could not get doc_handle".to_string(),
                            ))?;
                        match &notif {
                            UserStateNotification::Upsert {
                                user_id: uid,
                                ref_id: rid,
                                ..
                            } => {
                                debug!(
                                    user_id = %uid,
                                    ref_id = %rid,
                                    "Processing user state upsert notification"
                                );

                                let (doc_info, users) =
                                    to_doc_info(&notif).expect("Invalid upsert notification");
                                let result = handle_upsert(&doc_handle, rid, doc_info, users);
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
                            UserStateNotification::ProfileUpdate { .. } => unreachable!(),
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
        apply_profile_update(&doc_handle, true, &user_id, input_state.profile.clone())
            .map_err(|e| proptest::test_runner::TestCaseError::fail(e.to_string()))?;

        for (ref_id, doc_info) in &input_state.documents {
            // Collect the user entries referenced by this document's permissions.
            let doc_users: HashMap<String, crate::user_state::UserInfo> = doc_info
                .permissions
                .iter()
                .filter_map(|p| {
                    let uid = p.user.as_ref()?;
                    let info = input_state.users.get(uid)?;
                    Some((uid.clone(), info.clone()))
                })
                .collect();
            handle_upsert(&doc_handle, ref_id, doc_info.clone(), doc_users)
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
