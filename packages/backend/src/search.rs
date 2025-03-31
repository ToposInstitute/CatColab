use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;


#[derive(Debug, Serialize, Deserialize)]
pub struct Snapshot {
    pub id: i32,
    pub for_ref: Uuid,
    pub content: Value, 
    pub last_updated: chrono::DateTime<Utc>, 
    pub fts_tsvector: String,
    pub embedding: Option<Vec<f32>>, 
}

impl Snapshot {
    pub fn new(id: i32, for_ref: Uuid, content: Value, last_updated: chrono::DateTime<Utc>, fts_tsvector: String, embedding: Option<Vec<f32>>) -> Self {
        Self {
            id,
            for_ref,
            content,
            last_updated,
            fts_tsvector,
            embedding,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchParams {
    pub query: String,
    pub limit: Option<i32>,
    #[serde(default)]
    pub use_embedding: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub snapshot: Snapshot,
    pub score: f32,
}

pub async fn search_snapshots(ctx: AppCtx, params: SearchParams) -> Result<Vec<SearchResult>> {
    let limit = params.limit.unwrap_or(10);
    
    let search_query = if params.use_embedding {
        let embedding = get_embedding(&params.query).await?;
        sqlx::search_query_as!(
            SearchResult,
            r#"
            SELECT 
                s.*,
                1 - (s.embedding <=> $1) as score
            FROM snapshots s
            WHERE s.embedding IS NOT NULL
            ORDER BY s.embedding <=> $1
            LIMIT $2
            "#,
            &embedding as &[f32],
            limit
        )
    } else {
        sqlx::search_query_as!(
            SearchResult,
            r#"
            SELECT 
                s.*,
                ts_rank(s.fts_tsvector, to_tsquery('simple', $1)) as score
            FROM snapshots s
            WHERE s.fts_tsvector @@ to_tsquery('simple', $1)
            ORDER BY score DESC
            LIMIT $2
            "#,
            &params.query,
            limit
        )
    };

    query.fetch_all(&ctx.pool).await.map_err(Into::into)
}