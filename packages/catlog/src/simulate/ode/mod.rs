//! Simulation of dynamical systems defined by ODEs.

use nalgebra::DVector;
use ode_solvers::{
    self,
    dop_shared::{IntegrationError, SolverResult},
};

/** A system of ordinary differential equations (ODEs).

An ODE system is anything that can compute a vector field.
 */
pub trait ODESystem {
    /// Compute the vector field at the given time and state in place.
    fn vector_field(&self, dx: &mut DVector<f32>, x: &DVector<f32>, t: f32);

    /// Compute and return the vector field at the given time and state.
    fn eval_vector_field(&self, x: &DVector<f32>, t: f32) -> DVector<f32> {
        let mut dx = DVector::from_element(x.len(), 0.0f32);
        self.vector_field(&mut dx, x, t);
        dx
    }
}

/** An ODE problem ready to be solved.

An ODE problem comprises an [ODE system](ODESystem) plus the extra information
needed to solve the system, namely the initial values and the time span.
 */
#[derive(Clone, Debug, PartialEq)]
pub struct ODEProblem<Sys> {
    pub(crate) system: Sys,
    pub(crate) initial_values: DVector<f32>,
    pub(crate) start_time: f32,
    pub(crate) end_time: f32,
}

impl<Sys> ODEProblem<Sys> {
    /// Creates a new ODE problem.
    pub fn new(system: Sys, initial_values: DVector<f32>) -> Self {
        ODEProblem {
            system,
            initial_values,
            start_time: 0.0,
            end_time: 0.0,
        }
    }

    /// Sets the start time for the problem.
    pub fn start_time(mut self, t: f32) -> Self {
        self.start_time = t;
        self
    }

    /// Sets the end time for the problem.
    pub fn end_time(mut self, t: f32) -> Self {
        self.end_time = t;
        self
    }

    /// Sets the time span (start and end time) for the problem.
    pub fn time_span(mut self, tspan: (f32, f32)) -> Self {
        (self.start_time, self.end_time) = tspan;
        self
    }
}

impl<Sys> ODEProblem<Sys>
where
    Sys: ODESystem,
{
    /** Solves the ODE system using the Runge-Kutta method.

    Returns the results from the solver if successful and an integration error otherwise.
     */
    pub fn solve_rk4(
        &self,
        step_size: f32,
    ) -> Result<SolverResult<f32, DVector<f32>>, IntegrationError> {
        let mut stepper = ode_solvers::Rk4::new(
            self,
            self.start_time,
            self.initial_values.clone(),
            self.end_time,
            step_size,
        );
        stepper.integrate()?;
        Ok(stepper.into())
    }
}

impl<Sys> ode_solvers::dop_shared::System<f32, DVector<f32>> for &ODEProblem<Sys>
where
    Sys: ODESystem,
{
    fn system(&self, x: f32, y: &DVector<f32>, dy: &mut DVector<f32>) {
        self.system.vector_field(dy, y, x);
    }
}

pub mod dynamic;

#[allow(non_snake_case)]
pub mod lotka_volterra;
