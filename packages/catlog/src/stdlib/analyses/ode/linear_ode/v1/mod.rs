//! Version 1 of `linear_ode`, using `ode_semantics`.

pub mod linear_ode;
pub use linear_ode::*;

use crate::stdlib::analyses::ode::{ODESemanticsGeneralProblemData, linear_ode::v0};

/// Migration for problem data for linear ODE.
pub fn migrate_problem_data_v0_to_v1(v0: v0::LinearODEProblemData) -> LinearODEProblemData {
    LinearODEProblemData {
        general_data: ODESemanticsGeneralProblemData {
            initial_values: v0.initial_values,
            duration: v0.duration,
        },
        parameter_data: LinearODEParameterData { coefficients: v0.coefficients },
    }
}
