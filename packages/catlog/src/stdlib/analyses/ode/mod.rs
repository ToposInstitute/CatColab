//! ODE analyses of models.

use std::{collections::HashMap, hash::Hash};

use derivative::Derivative;
use ode_solvers::dop_shared::IntegrationError;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify_next::Tsify;

use crate::simulate::ode::{ODEProblem, ODESystem};

/// Solution to an ODE problem.
#[derive(Clone, Derivative)]
#[derivative(Default(bound = ""))]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub struct ODESolution<Id>
where
    Id: Eq + Hash,
{
    /// Values of time variable for the duration of the simulation.
    time: Vec<f32>,

    /// Values of state variables for the duration of the simulation.
    states: HashMap<Id, Vec<f32>>,
}

/// Solves an ODE problem for an analysis with reasonable default settings.
pub fn solve_ode_analysis<Id: Eq + Hash, Sys: ODESystem>(
    problem: ODEProblem<Sys>,
    var_index: HashMap<Id, usize>,
) -> Result<ODESolution<Id>, IntegrationError> {
    // ODE solver will fail in the degenerate case of an empty system.
    if var_index.is_empty() {
        return Ok(Default::default());
    }

    let duration = problem.end_time - problem.start_time;
    let output_step_size = (duration / 100.0).min(0.01f32);
    let result = problem.solve_dopri5(output_step_size)?;

    let (t_out, x_out) = result.get();
    Ok(ODESolution {
        time: t_out.clone(),
        states: var_index
            .into_iter()
            .map(|(ob, i)| (ob, x_out.iter().map(|x| x[i]).collect()))
            .collect(),
    })
}

#[allow(non_snake_case)]
pub mod lotka_volterra;
#[allow(clippy::type_complexity)]
pub mod mass_action;

pub use lotka_volterra::*;
pub use mass_action::*;
