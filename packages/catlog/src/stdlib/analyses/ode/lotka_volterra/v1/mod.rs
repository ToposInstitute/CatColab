//! Version 1 of `lotka_volterra`, using `ode_semantics`.

pub mod lotka_volterra;
pub use lotka_volterra::*;

use crate::stdlib::analyses::ode::{ODESemanticsGeneralProblemData, lotka_volterra::v0};

/// Migration for problem data for Lotka-Volterra.
pub fn migrate_problem_data_v0_to_v1(v0: v0::LotkaVolterraProblemData) -> LotkaVolterraProblemData {
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
