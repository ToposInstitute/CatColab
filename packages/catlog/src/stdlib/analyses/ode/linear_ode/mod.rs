//! Linear constant-coefficient first-order ODE analysis of models.
//!
//! The main entry point for this module is
//! [`linear_ode_analysis`](SignedCoefficientBuilder::linear_ode_analysis).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_wasm_bindgen::{Serializer, from_value};
use wasm_bindgen::prelude::*;

mod v0;

/// The current version number.
#[wasm_bindgen(js_name = "versionNumberLinearODE")]
pub fn current_version() -> String {
    "0".to_string()
}

/// The current version of linear ODE.
///
/// This should always track the latest version, and is the only version that is exported.
pub use crate::stdlib::analyses::ode::linear_ode::v0::linear_ode::*;

/// Versioned linear ODE problem data.
pub enum VersionedLinearODEProblemData {
    /// Version 0 problem data.
    V0(v0::LinearODEProblemData),
}

impl<'de> Deserialize<'de> for VersionedLinearODEProblemData {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = Value::deserialize(deserializer)?;
        let version = value.get("version").and_then(Value::as_str).unwrap_or("0");

        match version {
            "0" => {
                let data: v0::LinearODEProblemData =
                    serde_json::from_value(value).map_err(serde::de::Error::custom)?;
                Ok(VersionedLinearODEProblemData::V0(data))
            }
            other => Err(serde::de::Error::custom(format!("unsupported version {other}"))),
        }
    }
}

impl VersionedLinearODEProblemData {
    /// Update any versioned linear ODE problem data to the current version.
    pub fn to_current(self) -> LinearODEProblemData {
        match self {
            VersionedLinearODEProblemData::V0(v0) => v0,
        }
    }
}

#[wasm_bindgen(js_name = "latestVersionLinearODEProblemData")]
/// Take a JSON object, try to deserialise it as linear ODE problem data, and then bring it to the
/// current version.
pub fn latest_version_linear_ode_problem_data(input: JsValue) -> Result<JsValue, JsValue> {
    let data: VersionedLinearODEProblemData = from_value(input)
        .map_err(|error| JsValue::from_str(&format!("deserialize error: {error}")))?;
    let current_data = data.to_current();
    let serializer = Serializer::json_compatible();
    let output = current_data
        .serialize(&serializer)
        .map_err(|e| JsValue::from_str(&format!("serialize error: {e}")))?;

    Ok(output)
}
