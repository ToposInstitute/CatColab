use textplots::{Chart, Plot, Shape};

///
pub trait DDESystem {
    fn vector_field(&self, dx: &mut DVector<f32>, x: &DVector<f32>, t: f32);

    fn eval_vector_field(&self, x: &DVector<f32>, t: f32) -> DVector<f32> {
        let mut dx = DVector::from_element(x.len(), 0.0f32);
        self.vector_field(&mut dx, x, t);
        dx
    }
}

#[derive(Clone, Debug, PartialEq)]-
pub struct DDEProblem<Sys> {
    pub(crate) ode: ODEProblem<Sys>,
    pub(crate) lags: Vector<f32>,
}

impl<Sys> DDEProblem<Sys> {
    pub fn new(system: Sys, initial_values: DVector<f32>, lags: Vector<f32>) -> Self {
        DDEProblem {
            ode: ODEProblem::new(system, initial_values),
            lags
        }
    }

    pub fn start_time(mut self, t: f32) -> Self {
        self.ode.start_time = t;
        self
    }

    pub fn end_time(mut self, t: f32) -> Self {
        self.ode.end_time = t;
        self
    }

    pub fn time_span(mut self, tspan: (f32, f32)) -> Self {
        (self.ode.start_time, self.ode.end_time) = tspan;
        self
    }
}

impl<Sys> DDEProblem<Sys>
where 
    Sys: DDEProblem,
{
    pub fn solve(&self, step_size: f32) -> Result<SolverResult<f32, DVector<f32>>, IntegrationError> {

    }
}

impl DDE<Lags, f64, Vector3<f64>> for DDEProblem {
    /// Vector field implementation for DDE Problem.
    fn diff(&self, _t: f64, u: &DVector<f64>, ud: &DVector, dudt: &mut DVector<f64>) {
        // TODO implement lagging `ud`
        self.vector_field(dudt, u, _t)
    }

}
