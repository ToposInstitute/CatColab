//! Lotka-Volterra ODE analysis of models.
//!
//! This follows the structure of [`ode::ode_semantics`], implementing `ODESemantics` for
//! the struct `LotkaVolterraSemantics`.
//!
//! [`ode::ode_semantics`]: crate::stdlib::analyses::ode::ode_semantics

use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_wasm_bindgen::{Serializer, from_value};
use wasm_bindgen::prelude::*;

mod v0;
mod v1;

/// The current version number.
#[wasm_bindgen(js_name = "versionNumberLotkaVolterra")]
pub fn current_version() -> String {
    "1".to_string()
}

/// The current version of Lotka-Volterra.
pub mod current {
    // This should always track the latest version, and is the only version that is exported.
    pub use crate::stdlib::analyses::ode::lotka_volterra::v1::lotka_volterra::*;
}

/// Versioned Lotka-Volterra ODE problem data.
pub enum VersionedLotkaVolterraProblemData {
    /// Version 0 problem data.
    V0(v0::LotkaVolterraProblemData),
    /// Version 1 problem data.
    V1(v1::LotkaVolterraProblemData),
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
            "1" => {
                let data: v1::LotkaVolterraProblemData =
                    serde_json::from_value(value).map_err(serde::de::Error::custom)?;
                Ok(VersionedLotkaVolterraProblemData::V1(data))
            }
            other => Err(serde::de::Error::custom(format!("unsupported version {other}"))),
        }
    }
}

impl VersionedLotkaVolterraProblemData {
    /// Update any versioned Lotka-Volterra problem data to the current version.
    pub fn to_current(self) -> current::LotkaVolterraProblemData {
        match self {
            VersionedLotkaVolterraProblemData::V0(v0) => {
                VersionedLotkaVolterraProblemData::V1(v1::migrate_problem_data_v0_to_v1(v0))
                    .to_current()
            }

            VersionedLotkaVolterraProblemData::V1(v1) => v1,
        }
    }
}

#[wasm_bindgen(js_name = "latestVersionLotkaVolterraProblemData")]
/// Take a JSON object, try to deserialise it as Lotka-Volterra problem data, and then bring it to the
/// current version.
pub fn latest_version_lotka_volterra_problem_data(input: JsValue) -> Result<JsValue, JsValue> {
    let data: VersionedLotkaVolterraProblemData = from_value(input)
        .map_err(|error| JsValue::from_str(&format!("deserialize error: {error}")))?;
    let current_data = data.to_current();
    let serializer = Serializer::json_compatible();
    let output = current_data
        .serialize(&serializer)
        .map_err(|e| JsValue::from_str(&format!("serialize error: {e}")))?;

    Ok(output)
}

#[cfg(test)]
mod test {
    use std::rc::Rc;

    use super::*;
    use crate::{
        stdlib::{
            analyses::ode::{
                ODESemanticsAnalysis, ODESemanticsScalarExtension, lotka_volterra::current::*,
            },
            negative_feedback, th_signed_category,
        },
        zero::name,
    };
    use expect_test::expect;

    #[test]
    fn lotka_volterra_v0_to_v1_migration() {
        let th = Rc::new(th_signed_category());
        let model = negative_feedback(th);

        let v0_data = v0::LotkaVolterraProblemData {
            interaction_coeffs: [(name("positive"), 1.0), (name("negative"), 1.0)]
                .into_iter()
                .collect(),
            growth_rates: [(name("x"), 2.0), (name("y"), -1.0)].into_iter().collect(),
            initial_values: [(name("x"), 1.0), (name("y"), 1.0)].into_iter().collect(),
            duration: 10.0,
        };

        let v1_data = VersionedLotkaVolterraProblemData::V0(v0_data).to_current();

        let system = LotkaVolterraAnalysis::default().build_system(&model);
        let analysis = v1_data.parameter_data.extend_scalars(system);
        let expected = expect!([r#"
            dx = 2 x - x y
            dy = x y - y
        "#]);
        expected.assert_eq(&analysis.to_string());
    }
}
