//! Procedures to create and manipulate documents.

use crate::app::{AppCtx, AppError, AppState};
use crate::automerge_json::{ensure_autosave_listener, populate_automerge_from_json};
use crate::user_state::{
    DEFAULT_DOC_NAME, DocInfo, DocInfoType, PermissionInfo, extract_relations_from_json,
};
use crate::user_state_updates::{
    insert_new_doc, set_deleted_at_for_affected_users, update_doc_info_from_snapshot,
};
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
    let heads: Vec<String> =
        doc_handle.with_document(|doc| doc.get_heads().iter().map(|h| h.to_string()).collect());

    // If the automerge-repo document is created but the db transaction doesn't complete, then the
    // document will be orphaned. The only negative consequence of that is additional space used, but
    // that should be negligible and we can later create a service which periodically cleans out the
    // orphans
    let mut txn = ctx.state.db.begin().await?;

    let user_id = ctx.user.map(|user| user.user_id);
    sqlx::query!(
        "
        WITH snapshot AS (
            INSERT INTO snapshots(for_ref, content, last_updated, heads)
            VALUES ($1, $2, NOW(), $3)
            RETURNING id
        )
        INSERT INTO refs(id, head, created, doc_id)
        VALUES ($1, (SELECT id FROM snapshot), NOW(), $4)
        ",
        ref_id,
        content,
        &heads,
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

    let doc_info = DocInfo {
        name: autosurgeon::Text::from(
            content.get("name").and_then(|v| v.as_str()).unwrap_or(DEFAULT_DOC_NAME),
        ),
        type_name: content
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .parse()
            .unwrap_or(DocInfoType::Unknown),
        theory: content.get("theory").and_then(|v| v.as_str()).map(|s| s.to_string()),
        permissions: vec![PermissionInfo {
            user: user_id,
            level: crate::auth::PermissionLevel::Own,
        }],
        created_at: chrono::Utc::now(),
        deleted_at: None,
        depends_on: extract_relations_from_json(&content),
        used_by: Vec::new(),
    };

    insert_new_doc(&ctx.state, ref_id, doc_info).await;

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

/// Saves the document by overwriting the snapshot at the current head,
/// then pushes snapshot-derived fields to all initialized user state docs.
pub async fn autosave(
    state: AppState,
    ref_id: Uuid,
    content: Value,
    heads: &[String],
) -> Result<(), AppError> {
    sqlx::query!(
        "
        UPDATE snapshots
        SET content = $2, heads = $3, last_updated = NOW()
        WHERE id = (SELECT head FROM refs WHERE id = $1)
        ",
        ref_id,
        content,
        heads,
    )
    .execute(&state.db)
    .await?;

    // Update user state docs directly from the content we already have.
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
    let relations = extract_relations_from_json(&content);
    let ref_id_str = ref_id.to_string();

    let user_doc_ids: Vec<(String, samod::DocumentId)> = {
        let initialized = state.initialized_user_states.read().await;
        initialized.iter().map(|(uid, did)| (uid.clone(), did.clone())).collect()
    };

    for (user_id, doc_id) in user_doc_ids {
        let user_doc_handle = match state.repo.find(doc_id).await {
            Ok(Some(h)) => h,
            _ => continue,
        };
        if let Err(e) = update_doc_info_from_snapshot(
            &user_doc_handle,
            &ref_id_str,
            name.as_str(),
            type_name.clone(),
            theory.as_deref(),
            relations.clone(),
        ) {
            tracing::error!(
                %user_id,
                %ref_id,
                error = %e,
                "Failed to update user state from autosave"
            );
        }
    }

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

    let heads: Vec<String> =
        doc_handle.with_document(|doc| doc.get_heads().iter().map(|h| h.to_string()).collect());

    let doc_content = head_snapshot(state.clone(), ref_id).await?;

    sqlx::query!(
        "
        WITH snapshot AS (
            INSERT INTO snapshots(for_ref, content, last_updated, heads)
            VALUES ($1, $2, NOW(), $3)
            RETURNING id
        )
        UPDATE refs
        SET head = (SELECT id FROM snapshot)
        WHERE id = $1
        ",
        ref_id,
        doc_content,
        &heads,
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

    if let Err(e) =
        set_deleted_at_for_affected_users(&state, ref_id, Some(chrono::Utc::now())).await
    {
        tracing::error!(%ref_id, error = %e, "Failed to update user state after delete_ref");
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

    if let Err(e) = set_deleted_at_for_affected_users(&state, ref_id, None).await {
        tracing::error!(%ref_id, error = %e, "Failed to update user state after restore_ref");
    }

    Ok(())
}

/// Gets the Automerge document ID for a ref.
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
