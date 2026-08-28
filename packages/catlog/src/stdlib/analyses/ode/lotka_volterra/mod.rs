//! Lotka-Volterra ODE analysis of models.
//!
//! This follows the structure of [`ode::ode_semantics`], implementing `ODESemantics` for
//! the struct `LotkaVolterraSemantics`.
//!
//! [`ode::ode_semantics`]: crate::stdlib::analyses::ode::ode_semantics

use crate::stdlib::analyses::ode::ODESemanticsGeneralProblemData;
pub use crate::stdlib::analyses::ode::lotka_volterra::v1::lotka_volterra::*;

mod v0;
mod v1;

/// Latest version.
pub static CURRENT_VERSION: &str = "1";

/// Migration for problem data for Lotka-Volterra.
pub fn migrate_lotka_volterra_v0_to_v1(
    v0: v0::lotka_volterra::LotkaVolterraProblemData,
) -> LotkaVolterraProblemData {
    LotkaVolterraProblemData {
        general_data: ODESemanticsGeneralProblemData {
            initial_values: v0.initial_values,
            duration: v0.duration,
        },
        parameter_data: LotkaVolterraParameterData {
            interaction_coeffs: v0.interaction_coeffs,
            growth_rates: v0.growth_rates,
        },
    }
}

#[cfg(test)]
mod test {
    use std::rc::Rc;

    use super::*;
    use crate::{
        stdlib::{
            analyses::ode::{
                LotkaVolterraAnalysis, ODESemanticsAnalysis, ODESemanticsScalarExtension,
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

        let v0_data = v0::lotka_volterra::LotkaVolterraProblemData {
            interaction_coeffs: [(name("positive"), 1.0), (name("negative"), 1.0)]
                .into_iter()
                .collect(),
            growth_rates: [(name("x"), 2.0), (name("y"), -1.0)].into_iter().collect(),
            initial_values: [(name("x"), 1.0), (name("y"), 1.0)].into_iter().collect(),
            duration: 10.0,
        };

        let v1_data = migrate_lotka_volterra_v0_to_v1(v0_data);

        let system = LotkaVolterraAnalysis::default().build_system(&model);
        let analysis = v1_data.parameter_data.extend_scalars(system);
        let expected = expect!([r#"
            dx = 2 x - x y
            dy = x y - y
        "#]);
        expected.assert_eq(&analysis.to_string());
    }
}
