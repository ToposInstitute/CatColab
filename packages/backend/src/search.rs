use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;
use sqlx::query;
use crate::app::{AppState, AppError};


#[derive(Debug, Serialize, Deserialize)]
pub struct Snapshot {
    pub id: i32,
    pub for_ref: Uuid,
    pub content: Value, 
    pub last_updated: chrono::NaiveDateTime, 
    pub fts_tsvector: String,
    pub embedding: Option<Vec<f32>>, 
}

impl Snapshot {
    pub fn new(id: i32, for_ref: Uuid, content: Value, last_updated: chrono::NaiveDateTime, fts_tsvector: String, embedding: Option<Vec<f32>>) -> Self {
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

pub async fn search_snapshots(state: &AppState, search_query: &str) -> Result<Vec<Value>, AppError> {
    if search_query.trim().is_empty() {
        return Ok(vec![]); 
    }
    let formatted_query = format_search_query(search_query);
    let query = query!(
        r#"
        SELECT content FROM snapshots
        WHERE fts_tsvector @@ to_tsquery($1)
        "#,
        formatted_query
    );
    // query execution
    let results = query.fetch_all(&state.db).await.map_err(|e| {
        AppError::Db(e)
    })?;
    Ok(results.into_iter().map(|row| row.content).collect())
}

fn format_search_query(query: &str) -> String {
    let formatted_query = query.split_whitespace()
        .map(|word| word.to_lowercase())
        .collect::<Vec<String>>()
        .join(" & ");
    formatted_query
}