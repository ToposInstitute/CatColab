//! Procedures to create and manipulate documents.

use crate::app::{AppCtx, AppError, AppState, Paginated};
use crate::{auth::PermissionLevel, user::UserSummary};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use socketioxide::SocketIo;
use std::future::Future;
use std::pin::Pin;
use ts_rs::TS;
use uuid::Uuid;

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
        WITH
            filtered_ids AS (
                SELECT refs.id
                FROM refs
                WHERE (
                    -- optionally filter by owner username
                    $2::text IS NULL
                    OR EXISTS (
                        SELECT 1
                        FROM permissions
                        JOIN users
                        ON users.id = permissions.subject
                        WHERE
                            permissions.object = refs.id
                            AND permissions.level  = 'own'
                            AND users.username = $2
                    )
                ) AND (
                    -- optionally filter by document name
                    $3::text IS NULL
                    OR EXISTS (
                      SELECT 1
                      FROM snapshots
                      WHERE
                        snapshots.id = refs.head
                        AND snapshots.content->>'name' ILIKE '%' || $3 || '%'
                    )
                ) AND (
                    -- filter by minimum permission level or 'read'
                    get_max_permission($1, refs.id) >= COALESCE($4::permission_level, 'read'::permission_level)
                ) AND (
                    -- optionally filter by non-public documents
                    $5::bool IS NULL
                    OR $5 IS TRUE
                    OR EXISTS (
                        SELECT 1
                        FROM permissions p_searcher
                        WHERE
                            p_searcher.object = refs.id
                            AND p_searcher.subject = $1
                    )
                )
            ),
            paged_ids AS (
                SELECT id
                FROM filtered_ids
                ORDER BY (SELECT refs.created FROM refs WHERE refs.id = filtered_ids.id) DESC
                LIMIT  $6::int4
                OFFSET $7::int4
            ),
            stubs AS (
                SELECT *
                FROM get_ref_stubs(
                    $1,
                    (SELECT array_agg(id) FROM paged_ids)
                )
            ),
            total AS (
                SELECT COUNT(*) AS total_count FROM filtered_ids
            )
        SELECT
            stubs.ref_id AS "ref_id!",
            stubs.name,
            stubs.type_name,
            stubs.created_at AS "created_at!",
            stubs.permission_level AS "permission_level!: PermissionLevel",
            stubs.owner_id,
            stubs.owner_username,
            stubs.owner_display_name,
            -- returning the total like this is somewhat hacky, but allows us to avoid another table scan
            -- and duplicating the filter logic
            total.total_count::int4
        FROM stubs
        CROSS JOIN total;
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

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct RelatedRefStub {
    pub stub: RefStub,
    pub children: Vec<RelatedRefStub>,
}

fn find_root_ref<'a>(
    db: &'a sqlx::PgPool,
    start_id: Uuid,
) -> Pin<Box<dyn Future<Output = Result<Uuid, AppError>> + Send + 'a>> {
    Box::pin(async move {
        let parent: Option<Uuid> = sqlx::query_scalar!(
            r#"
            SELECT (content->'analysisOf'->>'_id')::uuid
              FROM snapshots
            WHERE id = (SELECT head FROM refs WHERE id = $1)
            UNION
            SELECT (content->'diagramIn'->>'_id')::uuid
              FROM snapshots
            WHERE id = (SELECT head FROM refs WHERE id = $1)
            LIMIT 1
            "#,
            start_id
        )
        .fetch_optional(db)
        .await?
        .flatten();

        if let Some(parent_id) = parent {
            find_root_ref(db, parent_id).await
        } else {
            Ok(start_id)
        }
    })
}

fn fetch_children<'a>(
    db: &'a sqlx::PgPool,
    user_id: Option<String>,
    parent_id: Uuid,
) -> Pin<Box<dyn Future<Output = Result<Vec<RelatedRefStub>, AppError>> + Send + 'a>> {
    Box::pin(async move {
        let rows = sqlx::query!(
            r#"
            SELECT refs.id AS "child_id!"
            FROM refs
            JOIN snapshots ON snapshots.id = refs.head
            WHERE ((snapshots.content->'analysisOf'->>'_id')::uuid = $1
                   OR (snapshots.content->'diagramIn'->>'_id')::uuid = $1)
              AND get_max_permission($2, refs.id) >= 'read'
            "#,
            parent_id,
            user_id,
        )
        .fetch_all(db)
        .await?;

        let child_ids: Vec<Uuid> = rows.into_iter().map(|r| r.child_id).collect();
        if child_ids.is_empty() {
            return Ok(Vec::new());
        }

        let stub_rows = sqlx::query!(
            r#"
            SELECT
                stubs.ref_id          AS "ref_id!",
                stubs.name,
                stubs.type_name,
                stubs.created_at       AS "created_at!",
                stubs.permission_level AS "permission_level!: PermissionLevel",
                stubs.owner_id,
                stubs.owner_username,
                stubs.owner_display_name
            FROM get_ref_stubs($1, $2::uuid[]) AS stubs
            "#,
            user_id.clone(),
            &child_ids,
        )
        .fetch_all(db)
        .await?;

        let mut result = Vec::with_capacity(stub_rows.len());
        for row in stub_rows {
            let stub = RefStub {
                ref_id: row.ref_id,
                name: row.name.unwrap_or_else(|| "untitled".into()),
                type_name: row.type_name.unwrap(),
                permission_level: row.permission_level,
                owner: row.owner_id.map(|id| UserSummary {
                    id,
                    username: row.owner_username.clone(),
                    display_name: row.owner_display_name.clone(),
                }),
                created_at: row.created_at,
            };
            let children = fetch_children(db, user_id.clone(), stub.ref_id).await?;
            result.push(RelatedRefStub { stub, children });
        }

        Ok(result)
    })
}

pub async fn get_related_ref_stubs(ctx: AppCtx, ref_id: Uuid) -> Result<RelatedRefStub, AppError> {
    let user_id = ctx.user.as_ref().map(|u| u.user_id.clone());

    let root_ref_id = find_root_ref(&ctx.state.db, ref_id).await?;

    let root_row = sqlx::query!(
        r#"
        SELECT
            stubs.ref_id AS "ref_id!",
            stubs.name,
            stubs.type_name,
            stubs.created_at AS "created_at!",
            stubs.permission_level AS "permission_level!: PermissionLevel",
            stubs.owner_id,
            stubs.owner_username,
            stubs.owner_display_name
        FROM get_ref_stubs($1, $2::uuid[]) AS stubs
        "#,
        user_id,
        &vec![root_ref_id],
    )
    .fetch_one(&ctx.state.db)
    .await?;

    let root_stub = RefStub {
        ref_id: root_row.ref_id,
        name: root_row.name.unwrap_or_else(|| "untitled".to_string()),
        type_name: root_row.type_name.expect("type_name should never be null"),
        permission_level: root_row.permission_level,
        owner: root_row.owner_id.map(|id| UserSummary {
            id,
            username: root_row.owner_username.clone(),
            display_name: root_row.owner_display_name.clone(),
        }),
        created_at: root_row.created_at,
    };

    let children = fetch_children(&ctx.state.db, user_id, root_ref_id).await?;
    Ok(RelatedRefStub {
        stub: root_stub,
        children,
    })
}
