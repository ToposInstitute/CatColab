//! Procedures to create and manipulate documents.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;
use uuid::Uuid;

use crate::app::{CreateDocSocketResponse, GetDocSocketResponse};

use super::app::{AppCtx, AppError, AppState};

/// Creates a new document ref with initial content.
pub async fn new_ref(ctx: AppCtx, content: Value) -> Result<Uuid, AppError> {
    let ref_id = Uuid::now_v7();

    let mut transaction = ctx.state.db.begin().await?;

    let insert_ref = sqlx::query!(
        "
        WITH snapshot AS (
            INSERT INTO snapshots(for_ref, content, last_updated)
            VALUES ($1, $2, NOW())
            RETURNING id
        )
        INSERT INTO refs(id, head, created)
        VALUES ($1, (SELECT id FROM snapshot), NOW())
        ",
        ref_id,
        content
    );
    insert_ref.execute(&mut *transaction).await?;

    let user_id = ctx.user.map(|user| user.user_id);
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
    let automerge_io = &state.automerge_io;

    // Expecting an array of responses instead of a single response for unknowable reasons
    let ack = automerge_io.emit_with_ack::<Vec<GetDocSocketResponse>>("get_doc", ref_id)
        .unwrap();
    let response_array = ack.await?.data;

    // Extract the first response
    let response = response_array.into_iter().next()
        .ok_or_else(|| AppError::AutomergeServer("Empty ack response".to_string()))?;

    match response {
        Ok(Some(doc_id)) => Ok(doc_id),
        Ok(None) => {
            let content = head_snapshot(state.clone(), ref_id).await?;
            let data = RefContent { ref_id, content };

            let ack = automerge_io
                .emit_with_ack::<Vec<CreateDocSocketResponse>>("create_doc", data)
                .unwrap();
            let response_array = ack.await?.data;
            let response = response_array.into_iter().next()
                .ok_or_else(|| AppError::AutomergeServer("Empty ack response".to_string()))?;

            match response {
                Ok(doc_id) => Ok(doc_id),
                Err(err) => Err(AppError::AutomergeServer(err)),
            }
        }
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
