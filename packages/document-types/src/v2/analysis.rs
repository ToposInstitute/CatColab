use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tsify::Tsify;

use crate::v0;

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)]
pub struct Analysis {
    id: String,
    content: HashMap<String, Value>,
    version: String,
}

impl Analysis {
    pub fn migrate_from_v0(old: v0::analysis::Analysis) -> Self {
        Self {
            id: old.id,
            content: old.content,
            version: "0".to_string(),
        }
    }
}
