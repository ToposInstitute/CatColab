//! Procedures to create and manipulate documents.

use crate::app::{AppCtx, AppError, AppState};
use crate::ref_actor::ensure_ref_actor;
use crate::user_state_updates::{update_ref_for_users, update_user_state};
use chrono::{DateTime, Utc};
use notebook_types::automerge_json::{hydrate_to_json, populate_automerge_from_json};
use notebook_types::automerge_util::copy_doc_at_heads;
use samod::DocumentId;
use serde_json::Value;
use uuid::Uuid;

/// Maximum allowed document size in bytes (5MB).
const MAX_DOCUMENT_SIZE: usize = 5 * 1024 * 1024;

/// Creates a new document ref with initial content.
pub async fn new_ref(ctx: AppCtx, content: Value) -> Result<Uuid, AppError> {
    // Check document size before processing
    let content_size = serde_json::to_string(&content).map(|s| s.len()).unwrap_or(0);
    if content_size > MAX_DOCUMENT_SIZE {
        return Err(AppError::Invalid(format!(
            "Document size ({} bytes) exceeds maximum allowed size ({} bytes)",
            content_size, MAX_DOCUMENT_SIZE
        )));
    }

    // Validate document structure by attempting to deserialize it
    let _validated_doc: notebook_types::VersionedDocument = serde_json::from_value(content.clone())
        .map_err(|e| AppError::Invalid(format!("Failed to parse document: {}", e)))?;

    let ref_id = Uuid::now_v7();

    // Create automerge document and populate it with the JSON content
    let mut automerge_doc = automerge::Automerge::new();
    automerge_doc
        .transact(|tx| {
            populate_automerge_from_json(tx, automerge::ROOT, &content)?;
            Ok::<_, automerge::AutomergeError>(())
        })
        .map_err(|e| AppError::Invalid(format!("Failed to populate document: {:?}", e)))?;

    let doc_handle = ctx.state.repo.create(automerge_doc).await?;

    let doc_id = doc_handle.document_id().to_string();
    let heads: Vec<Vec<u8>> =
        doc_handle.with_document(|doc| doc.get_heads().iter().map(|h| h.0.to_vec()).collect());

    // If the automerge-repo document is created but the db transaction doesn't complete, then the
    // document will be orphaned. The only negative consequence of that is additional space used, but
    // that should be negligible and we can later create a service which periodically cleans out the
    // orphans
    let mut txn = ctx.state.db.begin().await?;

    let user_id = ctx.user.map(|user| user.user_id);
    sqlx::query(
        "
        WITH snapshot AS (
            INSERT INTO snapshots(for_ref, content, created_at, heads)
            VALUES ($1, $2, NOW(), $4)
        RETURNING id
        )
        INSERT INTO refs(id, current_snapshot, created, doc_id)
        VALUES ($1, (SELECT id FROM snapshot), NOW(), $3)
        ",
    )
    .bind(ref_id)
    // Use the JSON provided by automerge as the authoritative content
    // serde_json::to_value(doc_content),
    .bind(content)
    .bind(doc_id)
    .bind(&heads)
    .execute(&mut *txn)
    .await?;

    sqlx::query!(
        "
        INSERT INTO permissions(subject, object, level)
        VALUES ($1, $2, 'own')
        ",
        user_id,
        ref_id,
    )
    .execute(&mut *txn)
    .await?;

    txn.commit().await?;

    ensure_ref_actor(ctx.state.clone(), ref_id, doc_handle).await;

    // Update the creating user's state from the database.
    if let Some(ref uid) = user_id
        && let Err(e) = update_user_state(&ctx.state, uid).await
    {
        tracing::error!(%ref_id, user_id = %uid, error = %e,
            "Failed to update user state after new_ref");
    }

    Ok(ref_id)
}

/// Gets the content of the head snapshot for a document ref.
pub async fn head_snapshot(state: AppState, ref_id: Uuid) -> Result<Value, AppError> {
    let query = sqlx::query!(
        "
        SELECT content FROM snapshots
        WHERE id = (SELECT current_snapshot FROM refs WHERE id = $1)
        ",
        ref_id
    );

    Ok(query.fetch_one(&state.db).await?.content)
}

/// Gets the binary automerge data for a document ref.
pub async fn head_snapshot_binary(state: AppState, ref_id: Uuid) -> Result<String, AppError> {
    let doc_id = get_doc_id(state.clone(), ref_id).await?;

    let doc_handle = state
        .repo
        .find(doc_id)
        .await?
        .ok_or_else(|| AppError::Invalid("Document not found".to_string()))?;

    let binary_data = doc_handle.with_document(|doc| doc.save());

    use base64::{Engine as _, engine::general_purpose};
    let base64_data = general_purpose::STANDARD.encode(&binary_data);

    Ok(base64_data)
}

/// Gets the deleted_at timestamp for a document ref.
pub async fn ref_deleted_at(
    state: AppState,
    ref_id: Uuid,
) -> Result<Option<DateTime<Utc>>, AppError> {
    let query = sqlx::query!(
        "
        SELECT deleted_at FROM refs WHERE id = $1
        ",
        ref_id
    );

    Ok(query.fetch_one(&state.db).await?.deleted_at)
}

/// Saves the document by creating a new snapshot and setting the current_snapshot to it.
pub async fn create_snapshot(state: AppState, ref_id: Uuid) -> Result<(), AppError> {
    let doc_id = get_doc_id(state.clone(), ref_id).await?;

    let doc_handle = state
        .repo
        .find(doc_id)
        .await?
        .ok_or_else(|| AppError::Invalid("Document not found".to_string()))?;

    let (heads, doc_content) = doc_handle.with_document(|doc| {
        let heads: Vec<Vec<u8>> = doc.get_heads().iter().map(|h| h.0.to_vec()).collect();
        let hydrated = doc.hydrate(None);
        let doc_content = hydrate_to_json(&hydrated);
        (heads, doc_content)
    });

    sqlx::query(
        "
        WITH snapshot AS (
            INSERT INTO snapshots(for_ref, content, created_at, heads, parent)
            VALUES ($1, $2, NOW(), $3, (SELECT current_snapshot FROM refs WHERE id = $1))
            RETURNING id
        )
        UPDATE refs
        SET current_snapshot = (SELECT id FROM snapshot)
        WHERE id = $1
        ",
    )
    .bind(ref_id)
    .bind(doc_content)
    .bind(&heads)
    .execute(&state.db)
    .await?;

    if let Err(e) = update_ref_for_users(&state, ref_id, vec![]).await {
        tracing::error!(%ref_id, error = %e, "Failed to update user states after create_snapshot");
    }

    Ok(())
}

/// Navigate a live Automerge document to a different snapshot's state.
///
/// The document is updated in-place: the target snapshot's state is read from
/// the Automerge history via its stored heads, then applied as new operations
/// (delete all root keys + repopulate). The `doc_id` is unchanged so connected
/// clients receive the update via normal Automerge sync.
///
/// The caller is responsible for suppressing autosave (the snapshot actor does
/// this via its `skip_changes` counter).
pub async fn navigate_to_snapshot(
    state: &AppState,
    ref_id: Uuid,
    snapshot_id: i32,
    doc_handle: &samod::DocHandle,
) -> Result<(), AppError> {
    let snapshot = sqlx::query!(
        "SELECT heads FROM snapshots WHERE id = $1 AND for_ref = $2",
        snapshot_id,
        ref_id,
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Invalid("Snapshot not found for this ref".to_string()))?;

    let target_heads: Vec<automerge::ChangeHash> = snapshot
        .heads
        .iter()
        .map(|h| automerge::ChangeHash(h.as_slice().try_into().expect("invalid change hash")))
        .collect();

    doc_handle.with_document(|doc| -> Result<(), AppError> {
        doc.transact::<_, _, automerge::AutomergeError>(|tx| {
            copy_doc_at_heads(tx, &target_heads)?;
            Ok(())
        })
        .map_err(|e| AppError::Invalid(format!("Failed to update document: {e:?}")))?;

        Ok(())
    })?;

    sqlx::query!("UPDATE refs SET current_snapshot = $2 WHERE id = $1", ref_id, snapshot_id,)
        .execute(&state.db)
        .await?;

    if let Err(e) = update_ref_for_users(state, ref_id, vec![]).await {
        tracing::error!(%ref_id, error = %e, "Failed to update user states after navigate_to_snapshot");
    }

    Ok(())
}

/// Soft-deletes a document reference by setting `deleted_at`.
pub async fn delete_ref(state: AppState, ref_id: Uuid) -> Result<(), AppError> {
    sqlx::query!(
        "
        UPDATE refs
        SET deleted_at = NOW()
        WHERE id = $1
        ",
        ref_id
    )
    .execute(&state.db)
    .await?;

    if let Err(e) = update_ref_for_users(&state, ref_id, vec![]).await {
        tracing::error!(%ref_id, error = %e, "Failed to update user states after delete_ref");
    }

    Ok(())
}

/// Restores a soft-deleted document reference.
pub async fn restore_ref(state: AppState, ref_id: Uuid) -> Result<(), AppError> {
    sqlx::query!(
        "
        UPDATE refs
        SET deleted_at = NULL
        WHERE id = $1
        ",
        ref_id
    )
    .execute(&state.db)
    .await?;

    if let Err(e) = update_ref_for_users(&state, ref_id, vec![]).await {
        tracing::error!(%ref_id, error = %e, "Failed to update user states after restore_ref");
    }

    Ok(())
}

/// Gets the Automerge document ID for the head snapshot of a ref.
pub async fn get_doc_id(state: AppState, ref_id: Uuid) -> Result<DocumentId, AppError> {
    let query = sqlx::query!(
        "
        SELECT doc_id FROM refs WHERE id = $1
        ",
        ref_id
    );

    let doc_id = query.fetch_one(&state.db).await?.doc_id;
    let doc_id: samod::DocumentId = doc_id
        .parse()
        .map_err(|_| AppError::Invalid("Invalid document ID".to_string()))?;

    Ok(doc_id)
}
