//! ODE analysis of models of the logic of systems of polynomial ODEs.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_wasm_bindgen::{Serializer, from_value};
use wasm_bindgen::prelude::*;

mod v0;

/// The current version number.
#[wasm_bindgen(js_name = "versionNumberPolynomialODE")]
pub fn current_version() -> String {
    "0".to_string()
}

/// The current version of polynomial ODE.
///
/// This should always track the latest version, and is the only version that is exported.
pub use crate::stdlib::analyses::ode::polynomial_ode::v0::polynomial_ode::*;

/// Versioned polynomial ODE problem data.
pub enum VersionedPolynomialODEProblemData {
    /// Version 0 problem data.
    V0(v0::PolynomialODEProblemData),
}

impl<'de> Deserialize<'de> for VersionedPolynomialODEProblemData {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = Value::deserialize(deserializer)?;
        let version = value.get("version").and_then(Value::as_str).unwrap_or("0");

        match version {
            "0" => {
                let data: v0::PolynomialODEProblemData =
                    serde_json::from_value(value).map_err(serde::de::Error::custom)?;
                Ok(VersionedPolynomialODEProblemData::V0(data))
            }
            other => Err(serde::de::Error::custom(format!("unsupported version {other}"))),
        }
    }
}

impl VersionedPolynomialODEProblemData {
    /// Update any versioned polynomial ODE problem data to the current version.
    pub fn to_current(self) -> PolynomialODEProblemData {
        match self {
            VersionedPolynomialODEProblemData::V0(v0) => v0,
        }
    }
}

#[wasm_bindgen(js_name = "latestVersionPolynomialODEProblemData")]
/// Take a JSON object, try to deserialise it as polynomial ODE problem data, and then bring it to the
/// current version.
pub fn latest_version_polynomial_ode_problem_data(input: JsValue) -> Result<JsValue, JsValue> {
    let data: VersionedPolynomialODEProblemData = from_value(input)
        .map_err(|error| JsValue::from_str(&format!("deserialize error: {error}")))?;
    let current_data = data.to_current();
    let serializer = Serializer::json_compatible();
    let output = current_data
        .serialize(&serializer)
        .map_err(|e| JsValue::from_str(&format!("serialize error: {e}")))?;

    Ok(output)
}
