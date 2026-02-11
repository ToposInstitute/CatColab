//! Procedures to create and manipulate documents.

use crate::app::{AppCtx, AppError, AppState, Paginated};
use crate::automerge_json::{ensure_autosave_listener, populate_automerge_from_json};
use crate::{auth::PermissionLevel, user::UserSummary};
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
    #[serde(rename = "refId")]
    pub ref_id: Uuid,
    pub content: Value,
}

/// A subset of user relevant information about a ref. Used for showing users
/// information on a variety of refs without having to load whole refs.
#[qubit::ts]
#[derive(Clone, Debug, Serialize, Deserialize)]
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

/// Parameters for filtering a search of refs.
#[qubit::ts]
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RefQueryParams {
    #[serde(rename = "ownerUsernameQuery")]
    pub owner_username_query: Option<String>,
    #[serde(rename = "refNameQuery")]
    pub ref_name_query: Option<String>,
    #[serde(rename = "searcherMinLevel")]
    pub searcher_min_level: Option<PermissionLevel>,
    #[serde(rename = "includePublicDocuments")]
    pub include_public_documents: Option<bool>,
    #[serde(rename = "onlyDeleted")]
    pub only_deleted: Option<bool>,
    pub limit: Option<i32>,
    pub offset: Option<i32>,
    // TODO: add param for document type
}

/// Searches for `RefStub`s that the current user has permission to access,
/// returning lightweight metadata about each matching ref.
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
                ) AND (
                    -- optionally filter for only deleted refs
                    ($8::bool IS TRUE AND refs.deleted_at IS NOT NULL)
                    OR ($8::bool IS NOT TRUE AND refs.deleted_at IS NULL)
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
        search_params.only_deleted.unwrap_or(false),
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

    Ok(Paginated { total, offset, items })
}

/// Gets ref stubs for children, where a child is defined as any document which
/// has an top level object containing the field `_id = parent.id`.
pub async fn get_ref_children_stubs(ctx: AppCtx, ref_id: Uuid) -> Result<Vec<RefStub>, AppError> {
    let user_id = ctx.user.as_ref().map(|u| u.user_id.clone());

    let stub_rows = sqlx::query!(
        r#"
        WITH child_refs AS (
            SELECT ARRAY_AGG(refs.id) AS child_ids
            FROM refs
            JOIN snapshots ON snapshots.id = refs.head
            WHERE (
                get_max_permission($2, refs.id) >= 'read'
                AND jsonb_path_exists(
                    snapshots.content,
                    '$.*[*] ? (@._id == $id)',
                    jsonb_build_object('id', $1::uuid)
                )
            )
        )
        SELECT
            stubs.ref_id           AS "ref_id!",
            stubs.name,
            stubs.type_name,
            stubs.created_at       AS "created_at!",
            stubs.permission_level AS "permission_level!: PermissionLevel",
            stubs.owner_id,
            stubs.owner_username,
            stubs.owner_display_name
        FROM
            child_refs,
            get_ref_stubs($2, child_refs.child_ids) AS stubs
        "#,
        ref_id,
        user_id,
    )
    .fetch_all(&ctx.state.db)
    .await?;

    let result = stub_rows
        .into_iter()
        .map(|row| RefStub {
            ref_id: row.ref_id,
            name: row.name.unwrap_or_else(|| "untitled".into()),
            type_name: row.type_name.unwrap(),
            permission_level: row.permission_level,
            owner: row.owner_id.map(|id| UserSummary {
                id,
                username: row.owner_username,
                display_name: row.owner_display_name,
            }),
            created_at: row.created_at,
        })
        .collect();

    Ok(result)
}
