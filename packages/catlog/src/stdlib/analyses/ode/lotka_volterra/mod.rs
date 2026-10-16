//! Lotka-Volterra ODE analysis of models.
//!
//! The main entry point for this module is
//! [`lotka_volterra_analysis`](SignedCoefficientBuilder::lotka_volterra_analysis).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_wasm_bindgen::{Serializer, from_value};
use wasm_bindgen::prelude::*;

mod v0;

/// The current version number.
#[wasm_bindgen(js_name = "versionNumberLotkaVolterra")]
pub fn current_version() -> String {
    "0".to_string()
}

/// The current version of Lotka-Volterra.
pub mod current {
    // This should always track the latest version, and is the only version that is exported.
    pub use crate::stdlib::analyses::ode::lotka_volterra::v0::lotka_volterra::*;
}

/// Versioned LotkaVolterra problem data.
pub enum VersionedLotkaVolterraProblemData {
    /// Version 0 problem data.
    V0(v0::LotkaVolterraProblemData),
}

impl<'de> Deserialize<'de> for VersionedLotkaVolterraProblemData {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = Value::deserialize(deserializer)?;
        let version = value.get("version").and_then(Value::as_str).unwrap_or("0");

        match version {
            "0" => {
                let data: v0::LotkaVolterraProblemData =
                    serde_json::from_value(value).map_err(serde::de::Error::custom)?;
                Ok(VersionedLotkaVolterraProblemData::V0(data))
            }
            other => Err(serde::de::Error::custom(format!("unsupported version {other}"))),
        }
    }
}

impl VersionedLotkaVolterraProblemData {
    /// Update any versioned LotkaVolterra problem data to the current version.
    pub fn to_current(self) -> current::LotkaVolterraProblemData {
        match self {
            VersionedLotkaVolterraProblemData::V0(v0) => v0,
        }
    }
}

#[wasm_bindgen(js_name = "latestVersionLotkaVolterraProblemData")]
/// Take a JSON object, try to deserialise it as LotkaVolterra problem data, and then bring it to the
/// current version.
pub fn latest_version_linear_ode_problem_data(input: JsValue) -> Result<JsValue, JsValue> {
    let data: VersionedLotkaVolterraProblemData = from_value(input)
        .map_err(|error| JsValue::from_str(&format!("deserialize error: {error}")))?;
    let current_data = data.to_current();
    let serializer = Serializer::json_compatible();
    let output = current_data
        .serialize(&serializer)
        .map_err(|e| JsValue::from_str(&format!("serialize error: {e}")))?;

    Ok(output)
}
