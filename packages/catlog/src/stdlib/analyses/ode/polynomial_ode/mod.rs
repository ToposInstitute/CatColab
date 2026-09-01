//! ODE analysis of models of the logic of systems of polynomial ODEs.
//!
//! This is used for the the simulation and equations analyses for models in the theory of
//! systems of polynomial ODEs [`th_polynomial_ode_system()`]. However, *all* ODE analyses
//! now factor through this by implementing [`ode::ode_semantics::ODESemantics`]; for further
//! documentation, see there.
//!
//! The interpretation of multicategories as systems of polynomial ODEs is explained in [RFC-0001].
//!
//! [`th_polynomial_ode_system()`]: crate::stdlib::theories
//! [`ode::ode_semantics::ODESemantics`]: crate::stdlib::analyses::ode::ode_semantics::ODESemantics
//! [RFC-0001]: https://next.catcolab.org/rfc/0001

use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_wasm_bindgen::{Serializer, from_value};
use wasm_bindgen::prelude::*;

mod v0;
mod v1;

/// The current version number.
#[wasm_bindgen(js_name = "versionNumberPolynomialODE")]
pub fn current_version() -> String {
    "1".to_string()
}

/// The current version of polynomial ODE.
pub mod current {
    // This should always track the latest version, and is the only version that is exported.
    pub use crate::stdlib::analyses::ode::polynomial_ode::v1::polynomial_ode::*;
}

/// Versioned polynomial ODE problem data.
pub enum VersionedPolynomialODEProblemData {
    /// Version 0 problem data.
    V0(v0::PolynomialODEProblemData),
    /// Version 1 problem data.
    V1(v1::PolynomialODEProblemData),
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
            "1" => {
                let data: v1::PolynomialODEProblemData =
                    serde_json::from_value(value).map_err(serde::de::Error::custom)?;
                Ok(VersionedPolynomialODEProblemData::V1(data))
            }
            other => Err(serde::de::Error::custom(format!("unsupported version {other}"))),
        }
    }
}

impl VersionedPolynomialODEProblemData {
    /// Update any versioned polynomial ODE problem data to the current version.
    pub fn to_current(self) -> current::PolynomialODEProblemData {
        match self {
            VersionedPolynomialODEProblemData::V0(v0) => {
                VersionedPolynomialODEProblemData::V1(v1::migrate_problem_data_v0_to_v1(v0))
                    .to_current()
            }

            VersionedPolynomialODEProblemData::V1(v1) => v1,
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

#[cfg(test)]
mod test {
    use std::rc::Rc;

    use super::*;
    use crate::{
        stdlib::{
            analyses::ode::{ODESemanticsScalarExtension, polynomial_ode::current::*},
            th_polynomial_ode_system, unsigned_lotka_volterra_dynamics,
        },
        zero::name,
    };
    use expect_test::expect;

    #[test]
    fn polynomial_ode_v0_to_v1_migration() {
        let th = Rc::new(th_polynomial_ode_system());
        let model = unsigned_lotka_volterra_dynamics(th);

        let v0_data = v0::polynomial_ode::PolynomialODEProblemData {
            coefficients: [
                (name("A_growth"), 1.0),
                (name("B_growth"), 2.0),
                (name("C_growth"), -2.0),
                (name("AB_interaction"), 1.5),
                (name("BA_interaction"), -2.0),
                (name("BC_interaction"), 3.0),
                (name("CB_interaction"), -3.0),
            ]
            .into_iter()
            .collect(),
            initial_values: [(name("a"), 1.0), (name("b"), 1.0), (name("c"), 1.0)]
                .into_iter()
                .collect(),
            duration: 10.0,
        };

        let v1_data = VersionedPolynomialODEProblemData::V0(v0_data).to_current();

        let system = PolynomialODEAnalysis::default().build_system(&model);
        let analysis = v1_data.parameter_data.extend_scalars(system);
        let expected = expect!([r#"
            dA = A - 2 A B
            dB = 1.5 A B + 2 B - 3 B C
            dC = 3 B C - 2 C
        "#]);
        expected.assert_eq(&analysis.to_string());
    }
}
