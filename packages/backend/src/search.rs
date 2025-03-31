use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;


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