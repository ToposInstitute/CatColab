//! Procedures to create and manipulate documents.

use crate::app::{AppCtx, AppError, AppState};
use crate::automerge_json::{ensure_autosave_listener, populate_automerge_from_json};
use chrono::{DateTime, Utc};
use samod::DocumentId;
use serde::{Deserialize, Serialize};
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

    // If the automerge-repo document is created but the db transaction doesn't complete, then the
    // document will be orphaned. The only negative consequence of that is additional space used, but
    // that should be negligible and we can later create a service which periodically cleans out the
    // orphans
    let mut txn = ctx.state.db.begin().await?;

    let user_id = ctx.user.map(|user| user.user_id);
    sqlx::query!(
        "
        WITH snapshot AS (
            INSERT INTO snapshots(for_ref, content, last_updated, doc_id)
            VALUES ($1, $2, NOW(), $3)
            RETURNING id
        )
        INSERT INTO refs(id, head, created)
        VALUES ($1, (SELECT id FROM snapshot), NOW())
        ",
        ref_id,
        // Use the JSON provided by automerge as the authoritative content
        // serde_json::to_value(doc_content),
        content,
        doc_id,
    )
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

    ensure_autosave_listener(ctx.state.clone(), ref_id, doc_handle).await;

    Ok(ref_id)
}

/// Gets the content of the head snapshot for a document ref.
pub async fn head_snapshot(state: AppState, ref_id: Uuid) -> Result<Value, AppError> {
    let query = sqlx::query!(
        "
        SELECT content FROM snapshots
        WHERE id = (SELECT head FROM refs WHERE id = $1)
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

/// Saves the document by overwriting the snapshot at the current head.
pub async fn autosave(state: AppState, data: RefContent) -> Result<(), AppError> {
    let RefContent { ref_id, content } = data;
    sqlx::query!(
        "
        UPDATE snapshots
        SET content = $2, last_updated = NOW()
        WHERE id = (SELECT head FROM refs WHERE id = $1)
        ",
        ref_id,
        content
    )
    .execute(&state.db)
    .await?;

    Ok(())
}

/// Saves the document by replacing the head with a new snapshot.
///
/// The snapshot at the previous head is *not* deleted.
pub async fn create_snapshot(state: AppState, ref_id: Uuid) -> Result<(), AppError> {
    let doc_id = get_doc_id(state.clone(), ref_id).await?;

    let doc_handle = state
        .repo
        .find(doc_id)
        .await?
        .ok_or_else(|| AppError::Invalid("Document not found".to_string()))?;

    let cloned_doc = doc_handle.with_document(|doc| doc.clone());
    let cloned_handle = state.repo.create(cloned_doc).await?;

    let doc_content = head_snapshot(state.clone(), ref_id).await?;

    sqlx::query!(
        "
        WITH snapshot AS (
            INSERT INTO snapshots(for_ref, content, last_updated, doc_id)
            VALUES ($1, $2, NOW(), $3)
            RETURNING id
        )
        UPDATE refs
        SET head = (SELECT id FROM snapshot)
        WHERE id = $1
        ",
        ref_id,
        doc_content,
        cloned_handle.document_id().to_string(),
    )
    .execute(&state.db)
    .await?;

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
    Ok(())
}

/// Gets the Automerge document ID for the head snapshot of a ref.
pub async fn get_doc_id(state: AppState, ref_id: Uuid) -> Result<DocumentId, AppError> {
    let query = sqlx::query!(
        "
        SELECT doc_id FROM snapshots
        WHERE id = (SELECT head FROM refs WHERE id = $1)
        ",
        ref_id
    );

    let doc_id = query.fetch_one(&state.db).await?.doc_id;
    let doc_id: samod::DocumentId = doc_id
        .parse()
        .map_err(|_| AppError::Invalid("Invalid document ID".to_string()))?;

    let doc_handle = state
        .repo
        .find(doc_id.clone())
        .await?
        .ok_or_else(|| AppError::Invalid("Document not found".to_string()))?;

    ensure_autosave_listener(state, ref_id, doc_handle).await;

    Ok(doc_id)
}

/// A document ref along with its content.
#[qubit::ts]
#[derive(Debug, Serialize, Deserialize)]
pub struct RefContent {
    /// The UUID of the document ref.
    #[serde(rename = "refId")]
    pub ref_id: Uuid,
    /// The JSON content of the document.
    pub content: Value,
}
