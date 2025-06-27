//! ODE analyses of models.

use std::{collections::HashMap, hash::Hash};

use derivative::Derivative;
use ode_solvers::dop_shared::IntegrationError;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

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

/// Data needed to simulate and interpret an ODE analysis of a model.
pub struct ODEAnalysis<Id, Sys> {
    /// ODE problem for the analysis.
    pub problem: ODEProblem<Sys>,

    /// Mapping from IDs in model (usually object IDs) to variable indices.
    pub variable_index: HashMap<Id, usize>,
}

impl<Id, Sys> ODEAnalysis<Id, Sys> {
    /// Constructs a new ODE analysis.
    pub fn new(problem: ODEProblem<Sys>, variable_index: HashMap<Id, usize>) -> Self {
        Self {
            problem,
            variable_index,
        }
    }

    /// Solves the ODE with reasonable default settings and collects results.
    pub fn solve_with_defaults(self) -> Result<ODESolution<Id>, IntegrationError>
    where
        Id: Eq + Hash,
        Sys: ODESystem,
    {
        // ODE solver will fail in the degenerate case of an empty system.
        if self.variable_index.is_empty() {
            return Ok(Default::default());
        }

        let duration = self.problem.end_time - self.problem.start_time;
        let output_step_size = (duration / 100.0).min(0.01f32);
        let result = self.problem.solve_dopri5(output_step_size)?;

        let (t_out, x_out) = result.get();
        Ok(ODESolution {
            time: t_out.clone(),
            states: self
                .variable_index
                .into_iter()
                .map(|(ob, i)| (ob, x_out.iter().map(|x| x[i]).collect()))
                .collect(),
        })
    }
}

#[allow(non_snake_case)]
pub mod ccl;
#[allow(non_snake_case)]
pub mod cclfo;
#[allow(non_snake_case)]
pub mod linear_ode;
#[allow(non_snake_case)]
pub mod lotka_volterra;
#[allow(non_snake_case)]
pub mod lotka_volterra;
#[allow(clippy::type_complexity)]
pub mod mass_action;

pub use ccl::*;
pub use cclfo::*;
pub use linear_ode::*;
pub use lotka_volterra::*;
pub use lotka_volterra::*;
pub use mass_action::*;
