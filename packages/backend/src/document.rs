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

pub async fn get_ref_stub(
    ctx: AppCtx,
    ref_id: Uuid,
) -> Result<RefStub, AppError> {
    // Ensure the user is authenticated
    let searcher_id = ctx
        .user
        .as_ref()
        .map(|user| user.user_id.clone())
        .ok_or(AppError::Unauthorized)?;

    // Query the most recent snapshot of the given ref_id if the user has permission
    let result = sqlx::query!(
        r#"
        WITH latest_snapshot AS (
            SELECT DISTINCT ON (snapshots.for_ref)
                refs.id AS ref_id, 
                snapshots.content->>'name' AS name
            FROM snapshots
            JOIN refs ON snapshots.for_ref = refs.id
            WHERE refs.id = $1
            ORDER BY snapshots.for_ref, snapshots.id DESC
        )
        SELECT 
            ls.ref_id,
            ls.name
        FROM latest_snapshot ls
        JOIN permissions p_searcher ON ls.ref_id = p_searcher.object
        WHERE 
            p_searcher.subject = $2
            AND p_searcher.level IN ('read', 'write', 'maintain', 'own')
            OR p_searcher.subject IS NULL -- user is allowed to access public documents
        LIMIT 1;
        "#,
        ref_id,
        searcher_id
    )
    .fetch_optional(&ctx.state.db)
    .await?;

    // If no result is found, return Not Found error
    let row = result.ok_or(AppError::Invalid(format!("No ref found for id: {}", ref_id)))?;

    Ok(RefStub {
        ref_id: row.ref_id,
        name: row.name.unwrap_or_else(|| "untitled".to_string()),
    })
}

/// Gets a vec of user relevant informations about refs that match the query parameters
pub async fn get_ref_stubs(
    ctx: AppCtx,
    search_params: RefQueryParams,
) -> Result<Vec<RefStub>, AppError> {
    // TODO: if searcher_id is None, restrict search to only publish documents
    let searcher_id = ctx
        .user
        .as_ref()
        .map(|user| user.user_id.clone())
        .ok_or(AppError::Unauthorized)?;

    // selects the ref id and ref name (from the most recent snapshot of that
    // ref) for all refs that a user (the searcher) has permission to access.
    // Optionally filter the results by the owner of the refs.
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
        LEFT JOIN users owner ON owner.id = (
            SELECT p_owner.subject 
            FROM permissions p_owner 
            WHERE p_owner.object = ls.ref_id 
            AND p_owner.level = 'own' 
            LIMIT 1
        )
        WHERE (
            (p_searcher.subject = $1
            AND p_searcher.level IN ('read', 'write', 'maintain', 'own'))
            OR p_searcher.subject IS NULL -- user is allowed to search public documents
        )
        AND (
            owner.username = $2  -- owner_username
            OR $2 IS NULL  -- include all owners if owner_username is NULL
        )
        AND (
            ls.name ILIKE '%' || $3 || '%'  -- case-insensitive substring search
            OR $3 IS NULL  -- include all if name filter is NULL
        )
        LIMIT 100; -- TODO: pagination
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
    // TODO: if searcher_id is None, restrict search to only publish documents
    let searcher_id = ctx
        .user
        .as_ref()
        .map(|user| user.user_id.clone())
        .ok_or(AppError::Unauthorized)?;

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
        AND p_searcher.level IN ('read', 'write', 'maintain', 'own')  -- Searcher must have permissions
        AND (
            ls.name ILIKE '%' || $3 || '%'  -- Case-insensitive substring search
            OR $3 IS NULL  -- Include all if name filter is NULL
        )
        LIMIT 100; -- TODO: pagination
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
