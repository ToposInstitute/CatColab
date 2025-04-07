//! Procedures to create and manipulate documents.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use socketioxide::SocketIo;
use ts_rs::TS;
use uuid::Uuid;

use super::app::{AppCtx, AppError, AppState};

/// Creates a new document ref with initial content.
pub async fn new_ref(ctx: AppCtx, content: Value) -> Result<Uuid, AppError> {
    let ref_id = Uuid::now_v7();

    // If the document is created but the db transaction doesn't complete, then the document will be
    // orphaned. The only negative consequence of that is additional space used, but that should be
    // negligible and we can later create a service which periodically cleans out the orphans
    let doc_id = create_automerge_doc(&ctx.state.automerge_io, content.clone()).await?;

    let mut transaction = ctx.state.db.begin().await?;

    let user_id = ctx.user.map(|user| user.user_id);
    let insert_ref = sqlx::query!(
        "
        WITH snapshot AS (
            INSERT INTO snapshots(for_ref, content, last_updated)
            VALUES ($1, $2, NOW())
            RETURNING id
        )
        INSERT INTO refs(id, head, created, doc_id)
        VALUES ($1, (SELECT id FROM snapshot), NOW(), $3)
        ",
        ref_id,
        content,
        doc_id,
    );
    insert_ref.execute(&mut *transaction).await?;

    let insert_permission = sqlx::query!(
        "
        INSERT INTO permissions(subject, object, level)
        VALUES ($1, $2, 'own')
        ",
        user_id,
        ref_id,
    );
    insert_permission.execute(&mut *transaction).await?;

    transaction.commit().await?;
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

/// Saves the document by overwriting the snapshot at the current head.
pub async fn autosave(state: AppState, data: RefContent) -> Result<(), AppError> {
    let RefContent { ref_id, content } = data;
    let query = sqlx::query!(
        "
        UPDATE snapshots
        SET content = $2, last_updated = NOW()
        WHERE id = (SELECT head FROM refs WHERE id = $1)
        ",
        ref_id,
        content
    );
    query.execute(&state.db).await?;
    Ok(())
}

/** Saves the document by replacing the head with a new snapshot.

The snapshot at the previous head is *not* deleted.
*/
pub async fn save_snapshot(state: AppState, data: RefContent) -> Result<(), AppError> {
    let RefContent { ref_id, content } = data;
    let query = sqlx::query!(
        "
        WITH snapshot AS (
            INSERT INTO snapshots(for_ref, content, last_updated)
            VALUES ($1, $2, NOW())
            RETURNING id
        )
        UPDATE refs
        SET head = (SELECT id FROM snapshot)
        WHERE id = $1
        ",
        ref_id,
        content
    );
    query.execute(&state.db).await?;
    Ok(())
}

pub async fn doc_id(state: AppState, ref_id: Uuid) -> Result<String, AppError> {
    let query = sqlx::query!(
        "
        SELECT doc_id FROM refs
        WHERE id = $1
        ",
        ref_id
    );

    let doc_id =
        query
            .fetch_one(&state.db)
            .await?
            .doc_id
            .ok_or(AppError::AutomergeServer(format!(
                "failed to find doc_id for ref_id '{}'",
                ref_id
            )))?;

    start_listening_automerge_doc(&state.automerge_io, ref_id, doc_id.clone()).await?;

    Ok(doc_id)
}

async fn start_listening_automerge_doc(
    automerge_io: &SocketIo,
    ref_id: Uuid,
    doc_id: String,
) -> Result<(), AppError> {
    let ack = automerge_io
        .emit_with_ack::<Vec<Result<(), String>>>("start_listening", [ref_id.to_string(), doc_id])
        .map_err(|e| {
            AppError::AutomergeServer(format!("Failed to call start_listening from backend {}", e))
        })?;

    let response_array = ack.await?.data;
    let response = response_array
        .into_iter()
        .next()
        .ok_or_else(|| AppError::AutomergeServer("Empty ack response".to_string()))?;

    match response {
        Ok(_) => Ok(()),
        Err(err) => Err(AppError::AutomergeServer(err)),
    }
}

async fn create_automerge_doc(automerge_io: &SocketIo, content: Value) -> Result<String, AppError> {
    let ack = automerge_io
        // Expecting an array of responses instead of a single response for unknowable reasons
        .emit_with_ack::<Vec<Result<String, String>>>("create_doc", content)
        .map_err(|e| {
            AppError::AutomergeServer(format!("Failed to call create_doc from backend {}", e))
        })?;

    let response_array = ack.await?.data;
    let response = response_array
        .into_iter()
        .next()
        .ok_or_else(|| AppError::AutomergeServer("Empty ack response".to_string()))?;

    match response {
        Ok(doc_id) => Ok(doc_id),
        Err(err) => Err(AppError::AutomergeServer(err)),
    }
}

/// A document ref along with its content.
#[derive(Debug, Serialize, Deserialize, TS)]
pub struct RefContent {
    #[serde(rename = "refId")]
    pub ref_id: Uuid,
    pub content: Value,
}
