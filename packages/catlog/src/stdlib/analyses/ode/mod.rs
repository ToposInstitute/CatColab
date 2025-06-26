//! ODE analyses of models.

use std::{collections::HashMap, hash::Hash};

use derivative::Derivative;
use ode_solvers::dop_shared::IntegrationError;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use crate::simulate::ode::{ODEProblem, ODESystem};

// DIFFSOL TESTING
use diffsol::{
    Bdf, DenseMatrix, NalgebraLU, NalgebraMat, NalgebraVec, OdeBuilder, OdeSolverMethod,
    OdeSolverState,
};
use ode_solvers::DVector;
type M = NalgebraMat<f64>;
type LS = NalgebraLU<f64>;

/// Solution to an ODE problem.
#[derive(Clone, Debug, Derivative)]
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
#[derive(Debug)]
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
        Id: Eq + Hash + std::fmt::Debug,
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

        let poly = self.problem.system;

        // let get = self.variable_index.values(););
        let problem = OdeBuilder::<M>::new()
            .rtol(1e-6)
            // .p([0.1])
            .rhs(|x, _, t, dx| poly.alt_vector_field(dx, x, t))
            .init(
                |_, _, y| {
                    for i in self.variable_index.values().into_iter() {
                        y[*i] = self.problem.initial_values[*i] as f64
                    }
                },
                self.variable_index.values().len(),
            )
            .build()
            .unwrap();

        let mut s = problem.tsit45().unwrap();
        let (_y_out, _t_out) = s.solve(duration.clone().into()).unwrap();

        Ok(ODESolution {
            time: _t_out.clone().iter().map(|&t| t as f32).collect::<Vec<f32>>(),
            states: self
                .variable_index
                .into_iter()
                .map(|(ob, i)| {
                    dbg!(&ob, &i);
                    (ob, (0.._t_out.len()).map(|c| _y_out[(i, c)] as f32).collect::<Vec<f32>>())
                })
                .collect(),
        })
    }
}

pub mod energese;
#[allow(non_snake_case)]
pub mod lotka_volterra;
#[allow(clippy::type_complexity)]
pub mod mass_action;

pub use energese::*;
pub use lotka_volterra::*;
pub use mass_action::*;
