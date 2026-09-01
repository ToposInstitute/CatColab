use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tsify::Tsify;

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
pub struct Analysis {
    pub id: String,
    pub content: HashMap<String, Value>,
}
