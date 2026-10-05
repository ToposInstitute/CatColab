use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tsify::Tsify;

use crate::v2;

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)]
pub struct Analysis {
    pub id: String,
    pub content: HashMap<String, Value>,
    pub version: String,
}

impl Analysis {
    pub fn migrate_from_v2(old: v2::analysis::Analysis) -> Self {
        Self {
            id: old.id,
            content: old.content,
            version: "0".to_string(),
        }
    }
}
