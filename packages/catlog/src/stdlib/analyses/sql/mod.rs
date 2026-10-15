//! Produces a valid SQL data manipulation script from a model in the theory of schemas.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_wasm_bindgen::{Serializer, from_value};
use wasm_bindgen::prelude::*;

mod v0;

/// The current version number.
#[wasm_bindgen(js_name = "versionNumberSQL")]
pub fn current_version() -> String {
    "0".to_string()
}

/// The current version of SQL.
pub mod current {
    // This should always track the latest version, and is the only version that is exported.
    pub use crate::stdlib::analyses::sql::v0::sql::*;
}
