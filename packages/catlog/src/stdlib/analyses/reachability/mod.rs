//! Reachability analyses of models.

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use {
    serde_json::Value,
    serde_wasm_bindgen::{Serializer, from_value},
    wasm_bindgen::prelude::*,
};

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

/// Versioned reachability problem data.
pub enum VersionedReachabilityProblemData {
    /// Version 0 problem data.
    V0(v0::ReachabilityProblemData),
}

impl<'de> Deserialize<'de> for VersionedReachabilityProblemData {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = Value::deserialize(deserializer)?;
        let version = value.get("version").and_then(Value::as_str).unwrap_or("0");

        match version {
            "0" => {
                let data: v0::ReachabilityProblemData =
                    serde_json::from_value(value).map_err(serde::de::Error::custom)?;
                Ok(VersionedReachabilityProblemData::V0(data))
            }
            other => Err(serde::de::Error::custom(format!("unsupported version {other}"))),
        }
    }
}

impl VersionedReachabilityProblemData {
    /// Update any versioned reachability problem data to the current version.
    pub fn to_current(self) -> current::ReachabilityProblemData {
        match self {
            VersionedReachabilityProblemData::V0(v0) => v0,
        }
    }
}

#[wasm_bindgen(js_name = "latestVersionReachabilityProblemData")]
/// Take a JSON object, try to deserialise it as reachability problem data, and then bring it to the
/// current version.
pub fn latest_version_linear_ode_problem_data(input: JsValue) -> Result<JsValue, JsValue> {
    let data: VersionedReachabilityProblemData = from_value(input)
        .map_err(|error| JsValue::from_str(&format!("deserialize error: {error}")))?;
    let current_data = data.to_current();
    let serializer = Serializer::json_compatible();
    let output = current_data
        .serialize(&serializer)
        .map_err(|e| JsValue::from_str(&format!("serialize error: {e}")))?;

    Ok(output)
}
