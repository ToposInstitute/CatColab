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

#[allow(dead_code)]
mod v0;
mod v1;

/// The current version number.
#[wasm_bindgen(js_name = "versionNumberMassAction")]
pub fn current_version() -> String {
    "1".to_string()
}

/// The current version of mass-action.
pub mod current {
    // This should always track the latest version, and is the only version that is exported.
    pub use crate::stdlib::analyses::ode::mass_action::v1::*;
}

// ┌--------------┐
// | PROBLEM DATA |
// └--------------┘

/// Versioned mass-action problem data.
pub enum VersionedMassActionProblemData {
    /// Version 0 problem data.
    V0(v0::MassActionProblemData),
    /// Version 1 problem data.
    V1(v1::MassActionProblemData),
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
            "1" => {
                let data: v1::MassActionProblemData =
                    serde_json::from_value(value).map_err(serde::de::Error::custom)?;
                Ok(VersionedMassActionProblemData::V1(data))
            }
            other => Err(serde::de::Error::custom(format!("unsupported version {other}"))),
        }
    }
}

impl VersionedMassActionProblemData {
    /// Update any versioned mass-action problem data to the current version.
    pub fn to_current(self) -> current::MassActionProblemData {
        match self {
            VersionedMassActionProblemData::V0(v0) => {
                VersionedMassActionProblemData::V1(v1::migrate_problem_data_v0_to_v1(v0))
                    .to_current()
            }

            VersionedMassActionProblemData::V1(v1) => v1,
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

// ┌----------------┐
// | EQUATIONS DATA |
// └----------------┘

/// Versioned mass-action equations data.
///
/// Note that future plans are to incorporate the equations analysis directly into the main analysis
/// so we temporarily ignore the variation in sizes between these enum variants.
#[allow(clippy::large_enum_variant)]
pub enum VersionedMassActionEquationsData {
    /// Version 0 equations data.
    V0(v0::MassActionEquationsData),
    /// Version 1 equations data.
    V1(v1::MassActionProblemData),
}

impl<'de> Deserialize<'de> for VersionedMassActionEquationsData {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = Value::deserialize(deserializer)?;
        let version = value.get("version").and_then(Value::as_str).unwrap_or("0");

        match version {
            "0" => {
                let data: v0::MassActionEquationsData =
                    serde_json::from_value(value).map_err(serde::de::Error::custom)?;
                Ok(VersionedMassActionEquationsData::V0(data))
            }
            "1" => {
                let data: v1::MassActionProblemData =
                    serde_json::from_value(value).map_err(serde::de::Error::custom)?;
                Ok(VersionedMassActionEquationsData::V1(data))
            }
            other => Err(serde::de::Error::custom(format!("unsupported version {other}"))),
        }
    }
}

impl VersionedMassActionEquationsData {
    /// Update any versioned mass-action problem data to the current version.
    pub fn to_current(self) -> current::MassActionProblemData {
        match self {
            VersionedMassActionEquationsData::V0(v0) => {
                VersionedMassActionEquationsData::V1(v1::migrate_equations_data_v0_to_v1(v0))
                    .to_current()
            }

            VersionedMassActionEquationsData::V1(v1) => v1,
        }
    }
}

#[wasm_bindgen(js_name = "latestVersionMassActionEquationsData")]
/// Take a JSON object, try to deserialise it as mass-action equations data, and then bring it to the
/// current version (which is really just `MassActionProblemData`).
pub fn latest_version_mass_action_equations_data(input: JsValue) -> Result<JsValue, JsValue> {
    let data: VersionedMassActionEquationsData = from_value(input)
        .map_err(|error| JsValue::from_str(&format!("deserialize error: {error}")))?;
    let current_data = data.to_current();
    let serializer = Serializer::json_compatible();
    let output = current_data
        .serialize(&serializer)
        .map_err(|e| JsValue::from_str(&format!("serialize error: {e}")))?;

    Ok(output)
}

// ┌-------┐
// | TESTS |
// └-------┘

#[cfg(test)]
mod test {
    use std::{collections::HashMap, rc::Rc};

    use super::*;
    use crate::{
        stdlib::{
            analyses::ode::{
                ODESemanticsAnalysis, ODESemanticsScalarExtension, mass_action::current::*,
            },
            backward_link, catalyzed_reaction, th_category_links, th_sym_monoidal_category,
        },
        zero::name,
    };
    use expect_test::expect;

    #[test]
    fn petri_net_mass_action_v0_to_v1_migration() {
        let th = Rc::new(th_sym_monoidal_category());
        let model = catalyzed_reaction(th);

        let v0_data = v0::mass_action::MassActionProblemData {
            initial_values: [(name("x"), 1.0), (name("y"), 1.5), (name("c"), 2.0)]
                .into_iter()
                .collect(),
            duration: 10.0,
            equations_data: v0::mass_action::MassActionEquationsData {
                mass_conservation_type: v0::mass_action::MassConservationType::Balanced,
            },
            transition_rates: [(name("f"), 1.5)].into_iter().collect(),
            transition_consumption_rates: [(name("f"), 3.5)].into_iter().collect(),
            transition_production_rates: [(name("f"), 4.0)].into_iter().collect(),
            place_consumption_rates: [(
                name("f"),
                [(name("x"), 2.0), (name("c"), 3.0)].into_iter().collect(),
            )]
            .into_iter()
            .collect(),
            place_production_rates: [(
                name("f"),
                [(name("y"), 1.5), (name("c"), 2.5)].into_iter().collect(),
            )]
            .into_iter()
            .collect(),
        };

        let v1_data = VersionedMassActionProblemData::V0(v0_data).to_current();

        let balanced_system = PetriNetBalancedMassActionAnalysis::default().build_system(&model);
        let balanced_analysis = v1_data.balanced.parameter_data.extend_scalars(balanced_system);
        let balanced_expected = expect!([r#"
            dx = -1.5 c x
            dy = 1.5 c x
            dc = 0
        "#]);
        balanced_expected.assert_eq(&balanced_analysis.to_string());

        let unbalanced_system =
            PetriNetUnbalancedMassActionAnalysis::default().build_system(&model);
        let unbalanced_analysis =
            v1_data.unbalanced.parameter_data.extend_scalars(unbalanced_system);
        let unbalanced_expected = expect!([r#"
            dx = -3.5 c x
            dy = 4 c x
            dc = 0.5 c x
        "#]);
        unbalanced_expected.assert_eq(&unbalanced_analysis.to_string());

        let per_place_system = PetriNetPerPlaceMassActionAnalysis::default().build_system(&model);
        let per_place_analysis = v1_data.per_place.parameter_data.extend_scalars(per_place_system);
        let per_place_expected = expect!([r#"
            dx = -2 c x
            dy = 1.5 c x
            dc = -0.5 c x
        "#]);
        per_place_expected.assert_eq(&per_place_analysis.to_string());
    }

    #[test]
    fn stock_flow_mass_action_v0_to_v1_migration() {
        let th = Rc::new(th_category_links());
        let model = backward_link(th);

        let v0_data = v0::mass_action::MassActionProblemData {
            initial_values: [(name("x"), 1.0), (name("y"), 1.0)].into_iter().collect(),
            duration: 10.0,
            equations_data: v0::mass_action::MassActionEquationsData {
                mass_conservation_type: v0::mass_action::MassConservationType::Balanced,
            },
            transition_rates: [(name("f"), 3.0)].into_iter().collect(),
            transition_consumption_rates: [(name("f"), 1.5)].into_iter().collect(),
            transition_production_rates: [(name("f"), 2.0)].into_iter().collect(),
            place_consumption_rates: HashMap::new(),
            place_production_rates: HashMap::new(),
        };

        let v1_data = VersionedMassActionProblemData::V0(v0_data).to_current();

        let balanced_system = StockFlowBalancedMassActionAnalysis::default().build_system(&model);
        let balanced_analysis = v1_data.balanced.parameter_data.extend_scalars(balanced_system);

        let unbalanced_system =
            StockFlowUnbalancedMassActionAnalysis::default().build_system(&model);
        let unbalanced_analysis =
            v1_data.unbalanced.parameter_data.extend_scalars(unbalanced_system);

        let expected_balanced = expect!([r#"
            dx = -3 x y
            dy = 3 x y
        "#]);
        expected_balanced.assert_eq(&balanced_analysis.to_string());

        let expected_unbalanced = expect!([r#"
            dx = -1.5 x y
            dy = 2 x y
        "#]);
        expected_unbalanced.assert_eq(&unbalanced_analysis.to_string());
    }
}
