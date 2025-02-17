//! Procedures to create and manipulate documents.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;
use uuid::Uuid;

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

/// Gets an Automerge document ID for the document ref.
pub async fn doc_id(state: AppState, ref_id: Uuid) -> Result<String, AppError> {
    let automerge_io = &state.automerge_io;
    let ack = automerge_io.emit_with_ack::<Vec<Option<String>>>("get_doc", ref_id).unwrap();
    let mut response = ack.await?;

    let maybe_doc_id = response.data.pop().flatten();
    if let Some(doc_id) = maybe_doc_id {
        // If an Automerge doc handle for this ref already exists, return it.
        Ok(doc_id)
    } else {
        // Otherwise, fetch the content from the database and create a new
        // Automerge doc handle.
        let content = head_snapshot(state.clone(), ref_id).await?;
        let data = RefContent { ref_id, content };
        let ack = automerge_io.emit_with_ack::<Vec<String>>("create_doc", data).unwrap();
        let response = ack.await?;
        Ok(response.data[0].to_string())
    }
}

/// A document ref along with its content.
#[derive(Debug, Serialize, Deserialize, TS)]
pub struct RefContent {
    #[serde(rename = "refId")]
    pub ref_id: Uuid,
    pub content: Value,
}

/// A subset of user relevant information about a ref. Used for showing
/// users information on a variety of refs without having to load whole
/// refs.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct RefStub {
    pub name: String,
    pub ref_id: Uuid,
    // TODO: get the types for these fields serializeable
    // pub permission_level: PermissionLevel,
    // pub created_at
    // pub last_updated
}

/// Parameters for filtering a search of refs
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct RefQueryParams {
    pub owner_username_query: Option<String>,
    pub ref_name_query: Option<String>,
    // TODO: add param for document type
}

/// Gets a vec of user relevant informations about refs that match the query parameters
pub async fn get_ref_stubs(
    ctx: AppCtx,
    search_params: RefQueryParams,
) -> Result<Vec<RefStub>, AppError> {
    let searcher_id = ctx.user.as_ref().map(|user| user.user_id.clone());

    // selects the ref id and ref name (from the most recent snapshot of that ref) for all refs that a user (the searcher) has permission to access. Optionally filter the results by the owner of the refs.
    let results = sqlx::query!(
        r#"
        WITH latest_snapshots AS (
            SELECT DISTINCT ON (snapshots.for_ref) 
                refs.id AS ref_id, 
                snapshots.content->>'name' AS name
            FROM snapshots
            JOIN refs ON snapshots.for_ref = refs.id
            ORDER BY snapshots.for_ref, snapshots.id DESC
        )
        SELECT 
            ls.ref_id,
            ls.name
        FROM latest_snapshots ls
        JOIN permissions p_searcher ON ls.ref_id = p_searcher.object
        JOIN users owner ON owner.id = (
            SELECT p_owner.subject 
            FROM permissions p_owner 
            WHERE p_owner.object = ls.ref_id 
            AND p_owner.level = 'own' 
            LIMIT 1
        )
        WHERE p_searcher.subject = $1  -- searcher_id
        AND (
            owner.username = $2  -- owner_username
            OR $2 IS NULL  -- include all owners if owner_username is NULL
        )
        AND p_searcher.level IN ('read', 'write', 'maintain')
        AND (
            ls.name ILIKE '%' || $3 || '%'  -- case-insensitive substring search
            OR $3 IS NULL  -- include all if name filter is NULL
        )
        LIMIT 100 -- TODO: pagination;
        "#,
        searcher_id,
        search_params.owner_username_query,
        search_params.ref_name_query
    )
    .fetch_all(&ctx.state.db)
    .await?;

    // Map SQL query results to Vec<RefStub>
    let stubs = results
        .into_iter()
        .map(|row| RefStub {
            ref_id: row.ref_id,
            name: row.name.unwrap_or_else(|| "untitled".to_string()),
        })
        .collect();

    Ok(stubs)
}

/// Gets a vec of user relevant informations about refs that are related to a user and match the search parameters
pub async fn get_ref_stubs_related_to_user(
    ctx: AppCtx,
    search_params: RefQueryParams,
) -> Result<Vec<RefStub>, AppError> {
    let searcher_id = ctx.user.as_ref().map(|user| user.user_id.clone());

    // for all refs that a user has permissions for, get those that the
    // searcher also has access to and filter those by search params. If no 
    // owner is specified, assume that the owner is the same as the searcher.
    let results = sqlx::query!(
        r#"
        WITH latest_snapshots AS (
            SELECT DISTINCT ON (snapshots.for_ref) 
                refs.id AS ref_id, 
                snapshots.content->>'name' AS name
            FROM snapshots
            JOIN refs ON snapshots.for_ref = refs.id
            ORDER BY snapshots.for_ref, snapshots.id DESC
        )
        SELECT 
            ls.ref_id,
            ls.name
        FROM latest_snapshots ls
        JOIN permissions p_searcher ON ls.ref_id = p_searcher.object
        JOIN permissions p_owner ON ls.ref_id = p_owner.object  -- Ensure owner has permissions
        JOIN users owner ON owner.id = p_owner.subject  -- Match permissions entry to owner
        WHERE p_searcher.subject = $1  -- searcher_id must have access
        AND (
            owner.username = COALESCE($2, (SELECT username FROM users WHERE id = $1))  -- Use searcher if owner_username is NULL
        )
        AND p_owner.level IN ('read', 'write', 'maintain', 'own')  -- Owner must have at least one permission
        AND p_searcher.level IN ('read', 'write', 'maintain')  -- Searcher must have permissions
        AND (
            ls.name ILIKE '%' || $3 || '%'  -- Case-insensitive substring search
            OR $3 IS NULL  -- Include all if name filter is NULL
        )
        LIMIT 100 -- TODO: pagination;
        "#,
        searcher_id,
        search_params.owner_username_query,
        search_params.ref_name_query
    )
    .fetch_all(&ctx.state.db)
    .await?;

    // Map SQL query results to Vec<RefStub>
    let stubs = results
        .into_iter()
        .map(|row| RefStub {
            ref_id: row.ref_id,
            name: row.name.unwrap_or_else(|| "untitled".to_string()),
        })
        .collect();

    Ok(stubs)
}
