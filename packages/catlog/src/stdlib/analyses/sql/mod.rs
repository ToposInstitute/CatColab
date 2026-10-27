//! Produces a valid SQL data manipulation script from a model in the theory of schemas.

#[cfg(feature = "serde-wasm")]
use wasm_bindgen::prelude::*;

mod v0;

/// The current version of SQL.
///
/// This should always track the latest version, and is the only version that is exported.
pub use crate::stdlib::analyses::sql::v0::sql::*;

/// The current version number.
#[wasm_bindgen(js_name = "versionNumberSQL")]
pub fn current_version() -> String {
    "0".to_string()
}
