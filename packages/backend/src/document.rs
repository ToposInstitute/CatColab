//! Procedures to create and manipulate documents.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use socketioxide::SocketIo;
use ts_rs::TS;
use uuid::Uuid;

use crate::app::{AppCtx, AppError, AppState, Paginated};
use crate::{auth::PermissionLevel, user::UserSummary};

/// Creates a new document ref with initial content.
pub async fn new_ref(ctx: AppCtx, content: Value) -> Result<Uuid, AppError> {
    let ref_id = Uuid::now_v7();

    // If the document is created but the db transaction doesn't complete, then the document will be
    // orphaned. The only negative consequence of that is additional space used, but that should be
    // negligible and we can later create a service which periodically cleans out the orphans
    let new_doc_response = create_automerge_doc(&ctx.state.automerge_io, content.clone()).await?;

    let mut transaction = ctx.state.db.begin().await?;

    let user_id = ctx.user.map(|user| user.user_id);
    let insert_ref = sqlx::query!(
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
        new_doc_response.doc_json,
        new_doc_response.doc_id,
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
pub async fn create_snapshot(state: AppState, ref_id: Uuid) -> Result<(), AppError> {
    let head_doc_id_query = sqlx::query!(
        "
        SELECT doc_id FROM snapshots
        WHERE id = (SELECT head FROM refs WHERE id = $1)
        ",
        ref_id
    );

    let head_doc_id = head_doc_id_query.fetch_one(&state.db).await?.doc_id;
    let new_doc_response = clone_automerge_doc(&state.automerge_io, ref_id, head_doc_id).await?;

    let query = sqlx::query!(
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
        new_doc_response.doc_json,
        new_doc_response.doc_id,
    );
    query.execute(&state.db).await?;
    Ok(())
}

pub async fn doc_id(state: AppState, ref_id: Uuid) -> Result<String, AppError> {
    let query = sqlx::query!(
        "
        SELECT doc_id FROM snapshots
        WHERE id = (SELECT head FROM refs WHERE id = $1)
        ",
        ref_id
    );

    let doc_id = query.fetch_one(&state.db).await?.doc_id;

    start_listening_automerge_doc(&state.automerge_io, ref_id, doc_id.clone()).await?;

    Ok(doc_id)
}

async fn call_automerge_io<T, P>(
    automerge_io: &SocketIo,
    event: impl Into<String>,
    payload: P,
    fail_msg: impl Into<String>,
) -> Result<T, AppError>
where
    P: Serialize,
    T: for<'de> serde::Deserialize<'de>,
{
    let event = event.into();
    let fail_msg = fail_msg.into();

    let ack = automerge_io
        .emit_with_ack::<Vec<Result<T, String>>>(event, payload)
        .map_err(|e| AppError::AutomergeServer(format!("{fail_msg}: {e}")))?;

    let response_array = ack.await?.data;
    let response = response_array
        .into_iter()
        .next()
        .ok_or_else(|| AppError::AutomergeServer("Empty ack response".to_string()))?;

    response.map_err(AppError::AutomergeServer)
}

async fn start_listening_automerge_doc(
    automerge_io: &SocketIo,
    ref_id: Uuid,
    doc_id: String,
) -> Result<(), AppError> {
    call_automerge_io::<(), _>(
        automerge_io,
        "startListening",
        [ref_id.to_string(), doc_id],
        "Failed to call startListening from backend".to_string(),
    )
    .await
}

async fn clone_automerge_doc(
    automerge_io: &SocketIo,
    ref_id: Uuid,
    doc_id: String,
) -> Result<NewDocSocketResponse, AppError> {
    call_automerge_io::<NewDocSocketResponse, _>(
        automerge_io,
        "cloneDoc",
        [ref_id.to_string(), doc_id],
        "Failed to call cloneDoc from backend".to_string(),
    )
    .await
}

async fn create_automerge_doc(
    automerge_io: &SocketIo,
    content: serde_json::Value,
) -> Result<NewDocSocketResponse, AppError> {
    call_automerge_io::<NewDocSocketResponse, _>(
        automerge_io,
        "createDoc",
        content,
        "Failed to call createDoc from backend".to_string(),
    )
    .await
}

/// A document ref along with its content.
#[derive(Debug, Serialize, Deserialize, TS)]
pub struct RefContent {
    #[serde(rename = "refId")]
    pub ref_id: Uuid,
    pub content: Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewDocSocketResponse {
    #[serde(rename = "docId")]
    pub doc_id: String,
    #[serde(rename = "docJson")]
    pub doc_json: Value,
}

/// A subset of user relevant information about a ref. Used for showing
/// users information on a variety of refs without having to load whole
/// refs.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct RefStub {
    pub name: String,
    #[serde(rename = "typeName")]
    pub type_name: String,
    #[serde(rename = "refId")]
    pub ref_id: Uuid,
    // permission level that the current user has on this ref
    #[serde(rename = "permissionLevel")]
    pub permission_level: PermissionLevel,
    pub owner: Option<UserSummary>,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
}

/// Parameters for filtering a search of refs
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct RefQueryParams {
    #[serde(rename = "ownerUsernameQuery")]
    pub owner_username_query: Option<String>,
    #[serde(rename = "refNameQuery")]
    pub ref_name_query: Option<String>,
    #[serde(rename = "searcherMinLevel")]
    pub searcher_min_level: Option<PermissionLevel>,
    #[serde(rename = "includePublicDocuments")]
    pub include_public_documents: Option<bool>,
    pub limit: Option<i32>,
    pub offset: Option<i32>,
    // TODO: add param for document type
}

/// Searches for `RefStub`s that the current user has permission to access,
/// returning lightweight metadata about each matching ref
pub async fn search_ref_stubs(
    ctx: AppCtx,
    search_params: RefQueryParams,
) -> Result<Paginated<RefStub>, AppError> {
    let searcher_id = ctx.user.as_ref().map(|user| user.user_id.clone());

    let min_level = search_params.searcher_min_level.unwrap_or(PermissionLevel::Read);

    let limit = search_params.limit.unwrap_or(100);
    let offset = search_params.offset.unwrap_or(0);

    let results = sqlx::query!(
        r#"
        WITH effective_permissions AS (
            /*
              select at most one row per ref, the row is either:
               - the searcher’s own permission, if it exists
               - the public permission (subject IS NULL) when include_public_documents = TRUE and the
                 searcher does not already have a row
            */
            SELECT DISTINCT ON (object)
                   object,
                   level
            FROM   permissions
            WHERE  (subject = $1)
               OR  ($5 AND subject IS NULL)
            ORDER BY object,
                     (subject IS NOT NULL) DESC           -- prefer the user‑specific row
        )
        SELECT 
            refs.id AS ref_id,
            snapshots.content->>'name' AS name,
            snapshots.content->>'type' AS type_name,
            refs.created as created_at,
            effective_permissions.level AS "permission_level: PermissionLevel",
            owner.id AS "owner_id?",
            owner.username AS "owner_username?",
            owner.display_name AS "owner_display_name?",
            COUNT(*) OVER()::int4 AS total_count
        FROM refs
        JOIN snapshots ON snapshots.id = refs.head
        JOIN effective_permissions ON effective_permissions.object = refs.id
        JOIN permissions AS p_owner 
            ON p_owner.object = refs.id AND p_owner.level = 'own'
        LEFT JOIN users AS owner
            ON owner.id = p_owner.subject
        WHERE (
            owner.username = $2
            OR $2 IS NULL
        )
        AND (
            snapshots.content->>'name' ILIKE '%' || $3 || '%'
            OR $3 IS NULL
        )
        AND (
            effective_permissions.level >= $4
        )
        ORDER BY refs.created DESC
        LIMIT $6::int4
        OFFSET $7::int4;
        "#,
        searcher_id,
        search_params.owner_username_query,
        search_params.ref_name_query,
        min_level as PermissionLevel,
        search_params.include_public_documents.unwrap_or(false),
        limit,
        offset,
    )
    .fetch_all(&ctx.state.db)
    .await?;

    let total = results.first().and_then(|r| r.total_count).unwrap_or(0);

    // We can't use sqlx::query_as! because name and type_name can be null
    let items = results
        .into_iter()
        .map(|row| RefStub {
            ref_id: row.ref_id,
            name: row.name.unwrap_or_else(|| "untitled".to_string()),
            type_name: row.type_name.expect("type_name should never be null"),
            permission_level: row.permission_level,
            created_at: row.created_at,
            owner: match row.owner_id {
                Some(id) => Some(UserSummary {
                    id,
                    username: row.owner_username,
                    display_name: row.owner_display_name,
                }),
                _ => None,
            },
        })
        .collect();

    Ok(Paginated {
        total,
        offset,
        items,
    })
}
