//! Direct user-state mutation helpers called from RPC handlers.
//!
//! These functions modify individual user state Automerge documents in response
//! to permission changes, document creation/deletion, profile updates, etc.

use std::collections::HashMap;

use autosurgeon::Text;
use tracing::error;

use crate::app::{AppError, AppState};
use crate::user_state::{
    DEFAULT_DOC_NAME, DbPermission, DocInfo, DocInfoType, HistoryEntry, PermissionInfo,
    RelationInfo, UserInfo, UserState, extract_relations_from_json, reconcile_user_state,
};

// ---------------------------------------------------------------------------
// Direct user-state mutation helpers (called from RPC handlers)
// ---------------------------------------------------------------------------

/// Updates only snapshot-derived fields on an existing `DocInfo` entry.
///
/// Called after autosave, which only writes snapshot content. This is a partial
/// update because autosave cannot change permissions, timestamps, or user data —
/// those are handled by direct RPC-level calls to [`upsert_doc_for_user`] etc.
///
/// Returns `Ok(false)` if the `ref_id` isn't in the user's documents (user
/// doesn't have access), `Ok(true)` if the update was applied.
pub fn update_doc_info_from_snapshot(
    doc_handle: &samod::DocHandle,
    ref_id: &str,
    name: &str,
    type_name: DocInfoType,
    theory: Option<&str>,
    depends_on: Vec<RelationInfo>,
) -> Result<bool, AppError> {
    doc_handle.with_document(|doc| {
        let mut user_state: UserState =
            autosurgeon::hydrate(doc).map_err(|e| AppError::UserStateSync(e.to_string()))?;

        let Some(doc_info) = user_state.documents.get_mut(ref_id) else {
            return Ok(false);
        };

        doc_info.name = autosurgeon::Text::from(name);
        doc_info.type_name = type_name;
        doc_info.theory = theory.map(|s| s.to_string());
        doc_info.depends_on = depends_on;

        user_state.recompute_used_by();
        reconcile_user_state(doc, &user_state)?;
        Ok(true)
    })
}

/// Upsert a document entry in a single user's state doc.
///
/// Inserts or replaces the `DocInfo` in `documents`, merges `new_users` into
/// `known_users`, recomputes reverse relations, and reconciles.
pub fn upsert_doc_for_user(
    doc_handle: &samod::DocHandle,
    ref_id: &str,
    doc_info: DocInfo,
    new_users: HashMap<String, UserInfo>,
) -> Result<(), AppError> {
    doc_handle.with_document(|doc| {
        let mut user_state: UserState =
            autosurgeon::hydrate(doc).map_err(|e| AppError::UserStateSync(e.to_string()))?;

        user_state.documents.insert(ref_id.to_string(), doc_info);
        user_state.known_users.extend(new_users);
        user_state.recompute_used_by();
        reconcile_user_state(doc, &user_state)
    })
}

/// Insert a new document entry into a single user's Automerge state doc.
fn insert_doc_into_handle(
    doc_handle: &samod::DocHandle,
    ref_id: &str,
    doc_info: DocInfo,
) -> Result<(), AppError> {
    doc_handle.with_document(|doc| {
        let mut user_state: UserState =
            autosurgeon::hydrate(doc).map_err(|e| AppError::UserStateSync(e.to_string()))?;

        user_state.documents.insert(ref_id.to_string(), doc_info);
        user_state.recompute_used_by();
        reconcile_user_state(doc, &user_state)
    })
}

/// Insert a newly created document into all affected user state docs.
///
/// If the document is public (no owner subject), it is inserted into every
/// initialized user's state. Otherwise it is inserted only into the creating
/// user's state.
pub async fn insert_new_doc(state: &AppState, ref_id: uuid::Uuid, doc_info: DocInfo) {
    let is_public = doc_info.permissions.iter().any(|p| p.user.is_none());
    let ref_id_str = ref_id.to_string();

    let targets: Vec<(String, samod::DocumentId)> = {
        let initialized = state.initialized_user_states.read().await;
        if is_public {
            initialized.iter().map(|(uid, did)| (uid.clone(), did.clone())).collect()
        } else {
            doc_info
                .permissions
                .iter()
                .filter_map(|p| p.user.as_ref())
                .filter_map(|uid| initialized.get(uid).map(|did| (uid.clone(), did.clone())))
                .collect()
        }
    };

    for (uid, doc_id) in targets {
        if let Ok(Some(handle)) = state.repo.find(doc_id).await
            && let Err(e) = insert_doc_into_handle(&handle, &ref_id_str, doc_info.clone())
        {
            error!(%ref_id, user_id = %uid, error = %e,
                "Failed to insert doc into user state");
        }
    }
}

/// Remove a document from a single user's state doc (permission revoked).
pub fn revoke_doc_for_user(doc_handle: &samod::DocHandle, ref_id: &str) -> Result<(), AppError> {
    doc_handle.with_document(|doc| {
        let mut user_state: UserState =
            autosurgeon::hydrate(doc).map_err(|e| AppError::UserStateSync(e.to_string()))?;

        user_state.documents.remove(ref_id);
        user_state.recompute_used_by();
        reconcile_user_state(doc, &user_state)
    })
}

/// Apply a profile update to a single user's state doc.
///
/// If `is_self` is true, updates the `profile` field.
/// Otherwise, updates the `known_users` entry for `updated_user_id` (if present).
pub fn apply_profile_update(
    doc_handle: &samod::DocHandle,
    is_self: bool,
    updated_user_id: &str,
    info: UserInfo,
) -> Result<(), AppError> {
    doc_handle.with_document(|doc| {
        let mut user_state: UserState =
            autosurgeon::hydrate(doc).map_err(|e| AppError::UserStateSync(e.to_string()))?;

        if is_self {
            user_state.profile = info;
        } else if user_state.known_users.contains_key(updated_user_id) {
            user_state.known_users.insert(updated_user_id.to_string(), info);
        } else {
            return Ok(());
        }

        reconcile_user_state(doc, &user_state)
    })
}

/// Patch only the `deleted_at` field on an existing document entry (inner, testable).
fn patch_deleted_at_on_doc(
    doc: &mut automerge::Automerge,
    ref_id: &str,
    deleted_at: Option<chrono::DateTime<chrono::Utc>>,
) -> Result<bool, AppError> {
    let mut user_state: UserState =
        autosurgeon::hydrate(doc).map_err(|e| AppError::UserStateSync(e.to_string()))?;

    let Some(doc_info) = user_state.documents.get_mut(ref_id) else {
        return Ok(false);
    };

    doc_info.deleted_at = deleted_at;
    reconcile_user_state(doc, &user_state)?;
    Ok(true)
}

/// Patch only the `deleted_at` field on an existing document entry.
///
/// Returns `Ok(false)` if the document isn't in the user's state (no-op),
/// `Ok(true)` if the field was updated.
pub fn patch_deleted_at(
    doc_handle: &samod::DocHandle,
    ref_id: &str,
    deleted_at: Option<chrono::DateTime<chrono::Utc>>,
) -> Result<bool, AppError> {
    doc_handle.with_document(|doc| patch_deleted_at_on_doc(doc, ref_id, deleted_at))
}

/// Set `deleted_at` on every initialized user's state doc that contains the ref.
pub async fn set_deleted_at_for_affected_users(
    state: &AppState,
    ref_id: uuid::Uuid,
    deleted_at: Option<chrono::DateTime<chrono::Utc>>,
) -> Result<(), AppError> {
    let ref_id_str = ref_id.to_string();

    let user_doc_ids: Vec<(String, samod::DocumentId)> = {
        let initialized = state.initialized_user_states.read().await;
        initialized.iter().map(|(uid, did)| (uid.clone(), did.clone())).collect()
    };

    for (user_id, doc_id) in user_doc_ids {
        let doc_handle = match state.repo.find(doc_id).await {
            Ok(Some(h)) => h,
            _ => continue,
        };

        if let Err(e) = patch_deleted_at(&doc_handle, &ref_id_str, deleted_at) {
            error!(
                %user_id,
                %ref_id,
                error = %e,
                "Failed to patch deleted_at in user state"
            );
        }
    }

    Ok(())
}

/// Push a history entry onto an existing document's `history` vec.
///
/// Returns `Ok(false)` if the document isn't in the user's state (no-op),
/// `Ok(true)` if the entry was appended.
pub fn push_history_entry(
    doc_handle: &samod::DocHandle,
    ref_id: &str,
    entry: HistoryEntry,
) -> Result<bool, AppError> {
    doc_handle.with_document(|doc| {
        let mut user_state: UserState =
            autosurgeon::hydrate(doc).map_err(|e| AppError::UserStateSync(e.to_string()))?;

        let Some(doc_info) = user_state.documents.get_mut(ref_id) else {
            return Ok(false);
        };

        doc_info.history.push(entry);
        reconcile_user_state(doc, &user_state)?;
        Ok(true)
    })
}

/// Push a history entry for every initialized user's state doc that contains the ref.
pub async fn push_history_for_affected_users(
    state: &AppState,
    ref_id: uuid::Uuid,
    entry: HistoryEntry,
) -> Result<(), AppError> {
    let ref_id_str = ref_id.to_string();

    let user_doc_ids: Vec<(String, samod::DocumentId)> = {
        let initialized = state.initialized_user_states.read().await;
        initialized.iter().map(|(uid, did)| (uid.clone(), did.clone())).collect()
    };

    for (user_id, doc_id) in user_doc_ids {
        let doc_handle = match state.repo.find(doc_id).await {
            Ok(Some(h)) => h,
            _ => continue,
        };

        if let Err(e) = push_history_entry(&doc_handle, &ref_id_str, entry.clone()) {
            error!(
                %user_id,
                %ref_id,
                error = %e,
                "Failed to push history entry in user state"
            );
        }
    }

    Ok(())
}

/// Patch only the `permissions` field (and merge `known_users`) on an existing
/// document entry (inner, testable).
fn patch_permissions_on_doc(
    doc: &mut automerge::Automerge,
    ref_id: &str,
    permissions: Vec<PermissionInfo>,
    new_known_users: HashMap<String, UserInfo>,
) -> Result<bool, AppError> {
    let mut user_state: UserState =
        autosurgeon::hydrate(doc).map_err(|e| AppError::UserStateSync(e.to_string()))?;

    let Some(doc_info) = user_state.documents.get_mut(ref_id) else {
        return Ok(false);
    };

    doc_info.permissions = permissions;
    user_state.known_users.extend(new_known_users);
    reconcile_user_state(doc, &user_state)?;
    Ok(true)
}

/// Patch only the `permissions` field (and merge `known_users`) on an existing
/// document entry in a single user's state doc.
///
/// Returns `Ok(false)` if the document isn't in the user's state (no-op),
/// `Ok(true)` if the permissions were updated.
pub fn patch_permissions_for_user(
    doc_handle: &samod::DocHandle,
    ref_id: &str,
    permissions: Vec<PermissionInfo>,
    new_known_users: HashMap<String, UserInfo>,
) -> Result<bool, AppError> {
    doc_handle
        .with_document(|doc| patch_permissions_on_doc(doc, ref_id, permissions, new_known_users))
}

/// Build a full [`DocInfo`] for a ref by querying the database.
///
/// Returns the `DocInfo`, a map of `UserInfo` for all users in the permissions,
/// and the list of all user IDs that have explicit permissions on this ref.
pub async fn build_doc_info_from_db(
    db: &sqlx::PgPool,
    ref_id: uuid::Uuid,
) -> Result<(DocInfo, HashMap<String, UserInfo>, Vec<String>), AppError> {
    use sqlx::Row;

    // Fetch the ref + snapshot metadata.
    let row = sqlx::query(
        r#"
        SELECT
            refs.created,
            refs.deleted_at,
            snapshots.content
        FROM refs
        JOIN snapshots ON snapshots.id = refs.head
        WHERE refs.id = $1
        "#,
    )
    .bind(ref_id)
    .fetch_one(db)
    .await?;

    let created_at: chrono::DateTime<chrono::Utc> = row.get("created");
    let deleted_at: Option<chrono::DateTime<chrono::Utc>> = row.get("deleted_at");
    let content: serde_json::Value = row.get("content");

    // Fetch all permissions for this ref.
    let perm_rows = sqlx::query(
        r#"
        SELECT subject, level::text AS level
        FROM permissions
        WHERE object = $1
        ORDER BY level DESC
        "#,
    )
    .bind(ref_id)
    .fetch_all(db)
    .await?;

    let permissions: Vec<PermissionInfo> = perm_rows
        .iter()
        .filter_map(|r| {
            let user: Option<String> = r.get("subject");
            let level_str: String = r.get("level");
            let db_perm = DbPermission { user_id: user, level: level_str };
            db_perm.to_permission_info()
        })
        .collect();

    let depends_on = extract_relations_from_json(&content);

    let name = content
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or(DEFAULT_DOC_NAME)
        .to_string();
    let type_name = content
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .parse()
        .unwrap_or(DocInfoType::Unknown);
    let theory = content.get("theory").and_then(|v| v.as_str()).map(|s| s.to_string());

    let doc_info = DocInfo {
        name: Text::from(name),
        type_name,
        theory,
        permissions,
        created_at,
        deleted_at,
        depends_on,
        used_by: Vec::new(),
        history: Vec::new(),
    };

    // Collect user IDs with explicit permissions.
    let user_ids: Vec<String> =
        doc_info.permissions.iter().filter_map(|p| p.user.clone()).collect();

    // Fetch user info for all referenced users.
    let known_users: HashMap<String, UserInfo> = if user_ids.is_empty() {
        HashMap::new()
    } else {
        let user_rows = sqlx::query!(
            r#"
            SELECT id, username, display_name FROM users
            WHERE id = ANY($1)
            "#,
            &user_ids,
        )
        .fetch_all(db)
        .await?;

        user_rows
            .into_iter()
            .map(|row| {
                (
                    row.id,
                    UserInfo {
                        username: row.username.map(Text::from),
                        display_name: row.display_name.map(Text::from),
                    },
                )
            })
            .collect()
    };

    Ok((doc_info, known_users, user_ids))
}

/// Update user state docs after a permission change on a ref.
///
/// Builds the full post-commit permissions list, determines which users gained
/// or lost access, and patches/upserts/revokes accordingly.
pub async fn update_permissions_for_affected_users(
    state: &AppState,
    ref_id: uuid::Uuid,
    subjects: &[Option<String>],
    levels: &[crate::auth::PermissionLevel],
    old_subjects: Vec<Option<String>>,
) -> Result<(), AppError> {
    // Fetch surviving owner rows to build the full post-commit permissions list.
    let owner_rows = sqlx::query_as::<_, (Option<String>, String)>(
        "SELECT subject, level::text FROM permissions WHERE object = $1 AND level = 'own'",
    )
    .bind(ref_id)
    .fetch_all(&state.db)
    .await?;

    let mut new_permissions: Vec<PermissionInfo> = owner_rows
        .iter()
        .filter_map(|(subj, lvl)| {
            let db_perm = DbPermission {
                user_id: subj.clone(),
                level: lvl.clone(),
            };
            db_perm.to_permission_info()
        })
        .collect();
    for (subj, lvl) in subjects.iter().zip(levels.iter()) {
        new_permissions.push(PermissionInfo { user: subj.clone(), level: *lvl });
    }
    new_permissions.sort_by(|a, b| b.level.cmp(&a.level));

    let ref_id_str = ref_id.to_string();
    let is_public = new_permissions.iter().any(|p| p.user.is_none());

    let all_perm_user_ids: Vec<String> =
        new_permissions.iter().filter_map(|p| p.user.clone()).collect();

    // Fetch user info for everyone in the new permissions set.
    let new_known_users: HashMap<String, UserInfo> = if all_perm_user_ids.is_empty() {
        HashMap::new()
    } else {
        let rows = sqlx::query!(
            "SELECT id, username, display_name FROM users WHERE id = ANY($1)",
            &all_perm_user_ids,
        )
        .fetch_all(&state.db)
        .await?;

        rows.into_iter()
            .map(|r| {
                (
                    r.id,
                    UserInfo {
                        username: r.username.map(Text::from),
                        display_name: r.display_name.map(Text::from),
                    },
                )
            })
            .collect()
    };

    // Determine who lost access: old non-owner subjects not in the new set.
    let new_subject_set: std::collections::HashSet<Option<String>> =
        subjects.iter().cloned().collect();
    let revoked_users: Vec<String> = old_subjects
        .into_iter()
        .filter(|s| !new_subject_set.contains(s))
        .flatten()
        .collect();

    let user_doc_ids: Vec<(String, samod::DocumentId)> = {
        let initialized = state.initialized_user_states.read().await;
        initialized.iter().map(|(uid, did)| (uid.clone(), did.clone())).collect()
    };

    // Lazily built full DocInfo — only fetched if a newly-granted user needs it
    // (i.e. the doc entry doesn't exist yet in their state).
    let mut cached_doc_info: Option<(DocInfo, HashMap<String, UserInfo>)> = None;

    for (user_id, doc_id) in &user_doc_ids {
        let doc_handle = match state.repo.find(doc_id.clone()).await {
            Ok(Some(h)) => h,
            _ => continue,
        };

        if revoked_users.contains(user_id) && !is_public {
            if let Err(e) = revoke_doc_for_user(&doc_handle, &ref_id_str) {
                error!(
                    %user_id, %ref_id, error = %e,
                    "Failed to revoke doc from user state"
                );
            }
        } else if is_public || all_perm_user_ids.contains(user_id) {
            match patch_permissions_for_user(
                &doc_handle,
                &ref_id_str,
                new_permissions.clone(),
                new_known_users.clone(),
            ) {
                Ok(true) => {}
                Ok(false) => {
                    if cached_doc_info.is_none() {
                        match build_doc_info_from_db(&state.db, ref_id).await {
                            Ok((di, ku, _)) => {
                                cached_doc_info = Some((di, ku));
                            }
                            Err(e) => {
                                error!(
                                    %ref_id, error = %e,
                                    "Failed to build doc info for new permission grant"
                                );
                                continue;
                            }
                        }
                    }
                    let (di, ku) = cached_doc_info.as_ref().unwrap();
                    if let Err(e) =
                        upsert_doc_for_user(&doc_handle, &ref_id_str, di.clone(), ku.clone())
                    {
                        error!(
                            %user_id, %ref_id, error = %e,
                            "Failed to upsert doc in user state after permission change"
                        );
                    }
                }
                Err(e) => {
                    error!(
                        %user_id, %ref_id, error = %e,
                        "Failed to patch permissions in user state"
                    );
                }
            }
        }
    }

    Ok(())
}

/// Handle a profile update by propagating to all initialized user state docs.
///
/// Updates the user's own `profile` field, and updates the `known_users` map
/// entry in all other initialized users' state docs that reference this user.
pub async fn propagate_profile_update(
    state: &AppState,
    user_id: &str,
    username: Option<String>,
    display_name: Option<String>,
) -> Result<(), AppError> {
    let info = UserInfo {
        username: username.map(Text::from),
        display_name: display_name.map(Text::from),
    };

    let user_doc_ids: Vec<(String, samod::DocumentId)> = {
        let initialized = state.initialized_user_states.read().await;
        initialized.iter().map(|(uid, did)| (uid.clone(), did.clone())).collect()
    };

    for (state_owner_id, doc_id) in user_doc_ids {
        let doc_handle = match state.repo.find(doc_id).await {
            Ok(Some(handle)) => handle,
            _ => continue,
        };

        let is_self = state_owner_id.as_str() == user_id;
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

#[cfg(test)]
mod unit_tests {
    use super::*;
    use crate::auth::PermissionLevel;
    use crate::user_state::user_state_to_automerge;
    use autosurgeon::Text;

    /// Helper: create an Automerge doc with a `UserState` and return the raw doc.
    fn make_doc(state: &UserState) -> automerge::Automerge {
        user_state_to_automerge(state).expect("Failed to convert to Automerge")
    }

    fn sample_doc_info() -> DocInfo {
        DocInfo {
            name: Text::from("Test Doc"),
            type_name: DocInfoType::Model,
            theory: Some("test-theory".to_string()),
            permissions: vec![PermissionInfo {
                user: Some("user_a".to_string()),
                level: PermissionLevel::Own,
            }],
            created_at: chrono::Utc::now(),
            deleted_at: None,
            depends_on: Vec::new(),
            used_by: Vec::new(),
            history: Vec::new(),
        }
    }

    #[test]
    fn patch_deleted_at_sets_and_clears() {
        let ref_id = uuid::Uuid::new_v4().to_string();
        let mut state = UserState::new();
        state.documents.insert(ref_id.clone(), sample_doc_info());

        let mut doc = make_doc(&state);

        // Set deleted_at.
        let now = chrono::Utc::now();
        let updated = super::patch_deleted_at_on_doc(&mut doc, &ref_id, Some(now))
            .expect("patch_deleted_at should succeed");
        assert!(updated, "Should return true when entry exists");

        let after: UserState = autosurgeon::hydrate(&doc).expect("hydrate should succeed");
        assert_eq!(
            after.documents[&ref_id].deleted_at.map(|dt| dt.timestamp_millis()),
            Some(now.timestamp_millis()),
        );

        // Clear deleted_at.
        let cleared = super::patch_deleted_at_on_doc(&mut doc, &ref_id, None)
            .expect("patch_deleted_at should succeed");
        assert!(cleared);

        let after: UserState = autosurgeon::hydrate(&doc).expect("hydrate should succeed");
        assert!(after.documents[&ref_id].deleted_at.is_none());
    }

    #[test]
    fn patch_deleted_at_returns_false_for_missing_entry() {
        let state = UserState::new();
        let mut doc = make_doc(&state);

        let result =
            super::patch_deleted_at_on_doc(&mut doc, "nonexistent", Some(chrono::Utc::now()))
                .expect("patch_deleted_at should succeed");
        assert!(!result, "Should return false when entry does not exist");
    }

    #[test]
    fn patch_permissions_updates_existing_entry() {
        let ref_id = uuid::Uuid::new_v4().to_string();
        let mut state = UserState::new();
        state.documents.insert(ref_id.clone(), sample_doc_info());

        let mut doc = make_doc(&state);

        let new_perms = vec![
            PermissionInfo {
                user: Some("user_a".to_string()),
                level: PermissionLevel::Own,
            },
            PermissionInfo {
                user: Some("user_b".to_string()),
                level: PermissionLevel::Read,
            },
        ];
        let mut new_users = HashMap::new();
        new_users.insert(
            "user_b".to_string(),
            UserInfo {
                username: Some(Text::from("bob")),
                display_name: None,
            },
        );

        let updated =
            super::patch_permissions_on_doc(&mut doc, &ref_id, new_perms.clone(), new_users)
                .expect("patch_permissions should succeed");
        assert!(updated);

        let after: UserState = autosurgeon::hydrate(&doc).expect("hydrate should succeed");
        assert_eq!(after.documents[&ref_id].permissions.len(), 2);
        assert!(after.known_users.contains_key("user_b"));
    }

    #[test]
    fn patch_permissions_returns_false_for_missing_entry() {
        let state = UserState::new();
        let mut doc = make_doc(&state);

        let result =
            super::patch_permissions_on_doc(&mut doc, "nonexistent", vec![], HashMap::new())
                .expect("patch_permissions should succeed");
        assert!(!result);
    }
}

#[cfg(all(test, feature = "property-tests"))]
mod tests {
    use super::*;
    use autosurgeon::hydrate;
    use test_strategy::proptest;

    use crate::user_state::UserState;
    use crate::user_state::arbitrary::arbitrary_user_state_with_id;

    /// Tests that incremental upserts via [`upsert_doc_for_user`] build up the
    /// expected user state, and that [`revoke_doc_for_user`] removes each entry
    /// correctly.  Uses an in-memory samod repo — no database required.
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
        let empty_state = UserState::new();
        doc.transact(|tx| autosurgeon::reconcile(tx, &empty_state))
            .map_err(|e| proptest::test_runner::TestCaseError::fail(format!("{:?}", e)))?;
        let doc_handle = repo.create(doc).await.unwrap();

        // Apply profile update, then upsert entries one at a time.
        apply_profile_update(&doc_handle, true, &user_id, input_state.profile.clone())
            .map_err(|e| proptest::test_runner::TestCaseError::fail(e.to_string()))?;

        for (ref_id, doc_info) in &input_state.documents {
            let doc_known_users: HashMap<String, UserInfo> = doc_info
                .permissions
                .iter()
                .filter_map(|p| {
                    let uid = p.user.as_ref()?;
                    let info = input_state.known_users.get(uid)?;
                    Some((uid.clone(), info.clone()))
                })
                .collect();
            upsert_doc_for_user(&doc_handle, ref_id, doc_info.clone(), doc_known_users)
                .map_err(|e| proptest::test_runner::TestCaseError::fail(e.to_string()))?;
        }

        let after_upserts: UserState =
            doc_handle.with_document(|doc| hydrate(doc).map_err(|e| e.to_string())).unwrap();
        proptest::prop_assert_eq!(&input_state, &after_upserts);

        // Revoke entries one at a time and verify the document empties.
        for ref_id in input_state.documents.keys() {
            revoke_doc_for_user(&doc_handle, ref_id)
                .map_err(|e| proptest::test_runner::TestCaseError::fail(e.to_string()))?;
        }

        let after_revokes: UserState =
            doc_handle.with_document(|doc| hydrate(doc).map_err(|e| e.to_string())).unwrap();
        proptest::prop_assert!(after_revokes.documents.is_empty());
    }
}
