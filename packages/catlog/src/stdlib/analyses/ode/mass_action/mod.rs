//! Mass-action ODE analysis of models.
//!
//! Such ODEs are based on the *law of mass action* familiar from chemistry and
//! mathematical epidemiology. Here, however, we also consider a generalised version
//! where we do not require that mass be preserved. This allows the construction
//! of systems of arbitrary polynomial (first-order) ODEs.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_wasm_bindgen::{Serializer, from_value};
use wasm_bindgen::prelude::*;

mod v0;

/// The current version number.
#[wasm_bindgen(js_name = "versionNumberMassAction")]
pub fn current_version() -> String {
    "0".to_string()
}

/// The current version of mass-action.
pub mod current {
    // This should always track the latest version, and is the only version that is exported.
    pub use crate::stdlib::analyses::ode::mass_action::v0::*;
}

/// Versioned mass-action problem data.
pub enum VersionedMassActionProblemData {
    /// Version 0 problem data.
    V0(v0::MassActionProblemData),
}

impl<'de> Deserialize<'de> for VersionedMassActionProblemData {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = Value::deserialize(deserializer)?;
        let version = value.get("version").and_then(Value::as_str).unwrap_or("0");

        match version {
            "0" => {
                let data: v0::MassActionProblemData =
                    serde_json::from_value(value).map_err(serde::de::Error::custom)?;
                Ok(VersionedMassActionProblemData::V0(data))
            }
            other => Err(serde::de::Error::custom(format!("unsupported version {other}"))),
        }
    }
}

impl VersionedMassActionProblemData {
    /// Update any versioned mass-action problem data to the current version.
    pub fn to_current(self) -> current::MassActionProblemData {
        match self {
            VersionedMassActionProblemData::V0(v0) => v0,
        }
    }
}

#[wasm_bindgen(js_name = "latestVersionMassActionProblemData")]
/// Take a JSON object, try to deserialise it as mass-action problem data, and then bring it to the
/// current version.
pub fn latest_version_mass_action_problem_data(input: JsValue) -> Result<JsValue, JsValue> {
    let data: VersionedMassActionProblemData = from_value(input)
        .map_err(|error| JsValue::from_str(&format!("deserialize error: {error}")))?;
    let current_data = data.to_current();
    let serializer = Serializer::json_compatible();
    let output = current_data
        .serialize(&serializer)
        .map_err(|e| JsValue::from_str(&format!("serialize error: {e}")))?;

    Ok(output)
}
