use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct Analysis {
    pub id: String,
    pub content: HashMap<String, Value>,
}
