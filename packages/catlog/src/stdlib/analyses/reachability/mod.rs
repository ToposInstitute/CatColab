//! Reachability analyses of models.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_wasm_bindgen::{from_value, Serializer};
use wasm_bindgen::prelude::*;

mod v0;

/// The current version number.
#[wasm_bindgen(js_name = "versionNumberReachability")]
pub fn current_version() -> String {
    "0".to_string()
}

/// The current version of reachability.
pub mod current {
    // This should always track the latest version, and is the only version that is exported.
    pub use crate::stdlib::analyses::reachability::v0::reachability::*;
}
