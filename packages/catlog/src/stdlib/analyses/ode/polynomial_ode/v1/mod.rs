//! Version 1 of `polynomial_ode`, with `ode_semantics`.

pub mod polynomial_ode;
pub use polynomial_ode::*;

use crate::stdlib::analyses::ode::{ODESemanticsGeneralProblemData, polynomial_ode::v0};

/// Migration for problem data for polynomial ODE.
pub fn migrate_problem_data_v0_to_v1(v0: v0::PolynomialODEProblemData) -> PolynomialODEProblemData {
    PolynomialODEProblemData {
        general_data: ODESemanticsGeneralProblemData {
            initial_values: v0.initial_values,
            duration: v0.duration,
        },
        parameter_data: PolynomialODEParameterData { coefficients: v0.coefficients },
    }
}
