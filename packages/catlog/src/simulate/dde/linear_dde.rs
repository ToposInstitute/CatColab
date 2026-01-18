#[derive(Clone, Debug, PartialEq)]
pub struct LinearDDESystem {
    coefficients: DMatrix<f32>,

    lags: DMatrix<f32>,
}

impl LinearDDESystem {
    pub fn new(coefficients: DMatrix<f32>, lags: DMatrix<f32>) -> Self {
        Self { coefficients, lags }
    }
}

impl DDESystem for LinearDDESystem {
    // TODO
    fn vector_field(&self, dx: &mut DVector<f32>, x: &DVector<f32>, _t: f32) {
        let A = &self.ode.coefficients;
        *dx = A * x
    }
}

impl DDE for DDESystem {
    fn diff(&self, t: f64, y: &Vector2<f64>, yd: &[Vector2<f64>; 1], dydt: &mut Vector2<f64>) {}
}

#[cfg(test)]
pub(crate) fn create_dde() -> DDEProblem<LinearDDESystem> {
    use nalgebra::{dmatrix, dvector};

    let A = dmatrix![-0.3,  0.0, 0.0;
                      0.0,  0.0, 0.5;
                      1.0, -2.0, 0.0];
    let lags = dmatrix![0.0, 0.0, 0.0;
                        0.0, 0.0, 0.0;
                        0.0, 0.0, 0.0];
    let system = LinearDDESystem::new(A, lags);
    let initial = dvector![2.0, 1.0, 1.0];
    DDEProblem::new(system, initial).end_time(10.0);
}
