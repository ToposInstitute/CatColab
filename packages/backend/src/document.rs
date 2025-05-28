//! Procedures to create and manipulate documents.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;
use uuid::Uuid;

use crate::{auth::PermissionLevel, user::UserSummary};
use super::app::{AppCtx, AppError, AppState};

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
    #[serde(rename = "theoryFilter")]
    pub theory_filter: Option<String>,
    #[serde(rename = "sortBy")]
    pub sort_by: Option<SortOption>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub enum SortOption {
    #[serde(rename = "lastModifiedNewest")]
    LastModifiedNewest,
    #[serde(rename = "lastModifiedOldest")]
    LastModifiedOldest,
    #[serde(rename = "createdNewest")]
    CreatedNewest,
    #[serde(rename = "createdOldest")]
    CreatedOldest,
    #[serde(rename = "nameAsc")]
    NameAsc,
    #[serde(rename = "nameDesc")]
    NameDesc,
}

/// Creates a new document ref with initial content.
pub async fn new_ref(ctx: AppCtx, content: Value) -> Result<Uuid, AppError> {
    let ref_id = Uuid::now_v7();

    let mut transaction = ctx.state.db.begin().await?;

    let user_id = ctx.user.map(|user| user.user_id);
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

/// Searches for `RefStub`s that the current user has permission to access,
/// returning lightweight metadata about each matching ref
pub async fn search_ref_stubs(
    ctx: AppCtx,
    search_params: RefQueryParams,
) -> Result<Vec<RefStub>, AppError> {
    let searcher_id = ctx.user.as_ref().map(|user| user.user_id.clone());
    let min_level = search_params.searcher_min_level.unwrap_or(PermissionLevel::Read);

    // Build the ORDER BY clause based on sort option
    let order_by = match search_params.sort_by {
        Some(SortOption::LastModifiedNewest) => "snapshots.last_updated DESC",
        Some(SortOption::LastModifiedOldest) => "snapshots.last_updated ASC",
        Some(SortOption::CreatedNewest) => "refs.created DESC",
        Some(SortOption::CreatedOldest) => "refs.created ASC",
        Some(SortOption::NameAsc) => "snapshots.content->>'name' ASC",
        Some(SortOption::NameDesc) => "snapshots.content->>'name' DESC",
        None => "snapshots.last_updated DESC", // Default sort
    };

    let results = sqlx::query!(
        r#"
        WITH effective_permissions AS (
            SELECT DISTINCT ON (object)
                   object,
                   level
            FROM   permissions
            WHERE  (subject = $1)
               OR  ($5 AND subject IS NULL)
            ORDER BY object,
                     (subject IS NOT NULL) DESC
        ),
        search_results AS (
            SELECT 
                refs.id AS ref_id,
                snapshots.content->>'name' AS name,
                snapshots.content->>'type' AS type_name,
                snapshots.content->>'theory' AS theory,
                refs.created as created_at,
                snapshots.last_updated as last_updated,
                effective_permissions.level AS "permission_level: PermissionLevel",
                owner.id AS "owner_id?",
                owner.username AS "owner_username?",
                owner.display_name AS "owner_display_name?",
                ts_rank_cd(
                    to_tsvector('english', snapshots.content->>'name'),
                    to_tsquery('english', $3)
                ) as name_rank
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
                $3 IS NULL
                OR to_tsvector('english', snapshots.content->>'name') @@ to_tsquery('english', $3)
            )
            AND (
                $6 IS NULL
                OR snapshots.content->>'theory' = $6
            )
            AND (
                effective_permissions.level >= $4
            )
        )
        SELECT * FROM search_results
        ORDER BY 
            CASE WHEN $3 IS NOT NULL THEN name_rank END DESC,
            """#,
        searcher_id,
        search_params.owner_username_query,
        search_params.ref_name_query.map(|q| q.replace(' ', ' & ')),
        min_level as PermissionLevel,
        search_params.include_public_documents.unwrap_or(false),
        search_params.theory_filter,
    )
    .fetch_all(&ctx.state.db)
    .await?;

    // We can't use sqlx::query_as! because name and type_name can be null
    let stubs = results
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

    Ok(stubs)
}

/// Creates necessary indexes for text search optimization
pub async fn create_search_indexes(state: &AppState) -> Result<(), AppError> {
    // Create GIN index for title text search
    sqlx::query!(
        r#"
        CREATE INDEX IF NOT EXISTS idx_snapshots_content_name_gin 
        ON snapshots USING GIN (to_tsvector('english', content->>'name'))
        "#
    )
    .execute(&state.db)
    .await?;

    // Create index for theory filtering
    sqlx::query!(
        r#"
        CREATE INDEX IF NOT EXISTS idx_snapshots_content_theory 
        ON snapshots ((content->>'theory'))
        "#
    )
    .execute(&state.db)
    .await?;

    // Create index for last_updated and created for sorting
    sqlx::query!(
        r#"
        CREATE INDEX IF NOT EXISTS idx_snapshots_last_updated 
        ON snapshots (last_updated)
        "#
    )
    .execute(&state.db)
    .await?;

    sqlx::query!(
        r#"
        CREATE INDEX IF NOT EXISTS idx_refs_created 
        ON refs (created)
        "#
    )
    .execute(&state.db)
    .await?;

    Ok(())
}
