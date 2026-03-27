//! User-state update helpers called from RPC handlers after mutations.

use crate::app::{AppError, AppState};
use crate::user_state::read_user_state_from_db;

/// Re-read the full user state from the database and reconcile it into the
/// user's Automerge doc.
///
/// No-op if the user has not been initialized (i.e. the user has never called
/// `get_or_create_user_state_doc`).
pub async fn update_user_state(state: &AppState, user_id: &str) -> Result<(), AppError> {
    let doc_id = {
        let initialized = state.initialized_user_states.read().await;
        match initialized.get(user_id) {
            Some(id) => id.clone(),
            None => return Ok(()),
        }
    };

    tracing::debug!(
        user_id = %user_id,
        doc_id = %doc_id,
        "Updating user state for user",
    );

    let user_state = read_user_state_from_db(user_id.to_string(), &state.db).await?;

    let doc_handle =
        state.repo.find(doc_id).await?.ok_or_else(|| {
            AppError::UserStateSync("User state doc not found in repo".to_string())
        })?;

    doc_handle.with_document(|doc| user_state.reconcile_into(doc))?;

    Ok(())
}

/// Update state for all initialized users who hold permissions on a ref.
///
/// `extra_user_ids` allows callers to include additional users who should be
/// updated (e.g. users whose permissions were revoked and who therefore no
/// longer appear in the permissions table).
pub async fn update_ref_for_users(
    state: &AppState,
    ref_id: uuid::Uuid,
    extra_user_ids: Vec<String>,
) -> Result<(), AppError> {
    let mut holders: Vec<String> = sqlx::query_scalar::<_, String>(
        "SELECT DISTINCT subject FROM permissions WHERE object = $1 AND subject IS NOT NULL",
    )
    .bind(ref_id)
    .fetch_all(&state.db)
    .await?;

    holders.extend(extra_user_ids);

    update_initialized_users(state, holders).await;
    Ok(())
}

/// Update state for a user and all users who share documents with them.
///
/// Called after a profile update so that:
/// - The user's own `profile` field is updated.
/// - Other users' `known_users` entries are updated.
pub async fn update_profile_for_users(state: &AppState, user_id: &str) -> Result<(), AppError> {
    let mut affected: Vec<String> = sqlx::query_scalar::<_, String>(
        r#"
        SELECT DISTINCT p2.subject
        FROM permissions p1
        JOIN permissions p2 ON p1.object = p2.object
        WHERE p1.subject = $1
          AND p2.subject IS NOT NULL
          AND p2.subject != $1
        "#,
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await?;

    affected.push(user_id.to_string());

    update_initialized_users(state, affected).await;
    Ok(())
}

/// Update each initialized user in the given set.
async fn update_initialized_users(state: &AppState, user_ids: Vec<String>) {
    let initialized = state.initialized_user_states.read().await;
    let to_update: Vec<String> = user_ids
        .into_iter()
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .filter(|uid| initialized.contains_key(uid))
        .collect();

    for user_id in to_update {
        if let Err(e) = update_user_state(state, &user_id).await {
            tracing::error!(%user_id, error = %e, "Failed to update user state");
        }
    }
}
