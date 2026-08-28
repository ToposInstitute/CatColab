//! Linear constant-coefficient first-order ODE analysis of models.
//!
//! This follows the structure of [`ode::ode_semantics`], implementing `ODESemantics` for the struct
//! `LinearODESemantics`.
//!
//! [`ode::ode_semantics`]: crate::stdlib::analyses::ode::ode_semantics

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use wasm_bindgen::prelude::wasm_bindgen;

use crate::stdlib::analyses::ode::ODESemanticsGeneralProblemData;
pub use crate::stdlib::analyses::ode::linear_ode::v1::linear_ode::*;

mod v0;
mod v1;

// TODO: Currently renaming all old problem data types just to make sure they get different names
//       in catlog_wasm.d.ts .... can we *not* do this? `serde( rename = "blah" )` doesn't work

/// Versioned linear ODE problem data.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub enum VersionedLinearODEProblemData {
    /// Version 0 problem data.
    V0(v0::linear_ode::V0LinearODEProblemData),
    /// Version 1 problem data.
    V1(LinearODEProblemData),
}

/// Migration for problem data for linear ODE.
#[wasm_bindgen(js_name = "migrateLinearODEToCurrentVersion")]
pub fn migrate_linear_ode_to_current_version(
    data: VersionedLinearODEProblemData,
) -> LinearODEProblemData {
    match data {
        VersionedLinearODEProblemData::V0(v0) => LinearODEProblemData {
            general_data: ODESemanticsGeneralProblemData {
                initial_values: v0.initial_values,
                duration: v0.duration,
            },
            parameter_data: LinearODEParameterData { coefficients: v0.coefficients },
        },
        VersionedLinearODEProblemData::V1(v1) => v1,
    }
}

#[cfg(test)]
mod test {
    use std::rc::Rc;

    use super::*;
    use crate::{
        stdlib::{
            analyses::ode::{LinearODEAnalysis, ODESemanticsAnalysis, ODESemanticsScalarExtension},
            negative_feedback, th_signed_category,
        },
        zero::name,
    };
    use expect_test::expect;

    #[test]
    fn linear_ode_v0_to_v1_migration() {
        let th = Rc::new(th_signed_category());
        let model = negative_feedback(th);

        let v0_data = v0::linear_ode::V0LinearODEProblemData {
            coefficients: [(name("positive"), 3.0), (name("negative"), 2.0)].into_iter().collect(),
            initial_values: [(name("x"), 1.0), (name("y"), 1.0)].into_iter().collect(),
            duration: 10.0,
        };

        let v1_data = migrate_linear_ode_v0_to_v1(v0_data);

        let system = LinearODEAnalysis::default().build_system(&model);
        let analysis = v1_data.parameter_data.extend_scalars(system);
        let expected = expect!([r#"
            dx = -2 y
            dy = 3 x
        "#]);
        expected.assert_eq(&analysis.to_string());
    }
}
