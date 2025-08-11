//! Constant-coefficient linear first-order differential equations.

use nalgebra::{DMatrix, DVector};
use std::collections::HashMap;

#[cfg(test)]
use super::ODEProblem;
use super::ODESystem;

/** A (constant-coefficient) linear (first-order) dynamical system.

A system of linear first-order ODEs with constant coefficients; a semantics for
causal loop diagrams.
*/
#[derive(Clone, Debug, PartialEq)]
pub struct LinearODESystem {
    coefficients: DMatrix<f32>,
}

impl LinearODESystem {
    /// Create a new LinearODE system.
    pub fn new(A: DMatrix<f32>) -> Self {
        Self { coefficients: A }
    }
}

impl ODESystem for LinearODESystem {
    fn vector_field(&self, dx: &mut DVector<f32>, x: &DVector<f32>, _t: f32) {
        let A = &self.coefficients;
        *dx = A * x
    }
}

// --------------------------------

// TODO move into a context where Id is defined
#[derive(Clone, Debug)]
pub enum Condition {
    Geq(usize, usize),
}

impl Condition {
    pub fn call(&self, x: &DVector<f32>) -> bool {
        match self {
            Condition::Geq(left, right) => x.row(*left) >= x.row(*right),
        }
    }
}

/**
 */
#[derive(Clone)]
pub struct HybridLinearODESystem {
    /// Linear ODEs
    pub subsystems: HashMap<Condition, LinearODESystem>,
}

impl HybridLinearODESystem {
    // TODO I dont like checking for the first condition to be met.
    pub fn get_subsystem(&self, x: &DVector<f32>) -> Option<&LinearODESystem> {
        self.subsystems
            .iter()
            .find(|(cond, _)| cond.call(&x.clone()))
            .map(|(_, sys)| sys)
    }
}

impl ODESystem for HybridLinearODESystem {
    fn vector_field(&self, dx: &mut DVector<f32>, x: &DVector<f32>, _t: f32) {
        if let Some(system) = self.get_subsystem(x) {
            system.vector_field(dx, x, _t)
        }
    }
}

#[cfg(test)]
pub(crate) fn create_neg_loops_pos_connector() -> ODEProblem<LinearODESystem> {
    use nalgebra::{dmatrix, dvector};

    let A = dmatrix![-0.3,  0.0,  0.0;
                      0.0,  0.0,  0.5;
                      1.0, -2.0,  0.0];
    let system = LinearODESystem::new(A);
    let initial = dvector![2.0, 1.0, 1.0];
    ODEProblem::new(system, initial).end_time(10.0)
}

#[cfg(test)]
mod tests {
    use expect_test::expect;

    use super::super::textplot_ode_result;
    use super::*;

    #[test]
    fn neg_loops_pos_connector() {
        let problem = create_neg_loops_pos_connector();
        let result = problem.solve_rk4(0.1).unwrap();
        let expected = expect![["
            ⡑⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀ 2.0
            ⠄⠈⠢⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠀⠈⠢⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⠀⣀⠤⠚⠲⣒⢄⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠔⠁⠀⠑⢄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⡠⠊⠀⠀⠀⠀⠀⠑⠬⣆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⠃⠀⠀⠀⠀⠈⢆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠚⢄⠀⠀⠀⠀⠀⠀⠀⠀⠈⠳⡤⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⠃⠀⠀⠀⠀⠀⠀⠈⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⠱⡀⠀⠀⠀⠀⠀⠀⠀⠀⠑⡄⠑⠢⢄⡀⠀⠀⠀⠀⠀⠀⠀⢀⠎⠀⠀⠀⠀⠀⠀⠀⠀⢘⡔⠊⠉⠉⠒⢄⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⠀⠀⠱⡀⠀⠀⠀⠀⠀⠀⠀⠀⠘⡄⠀⠀⠈⠉⠒⠤⢄⣀⠀⠀⡜⠀⠀⠀⠀⠀⠀⠀⢀⠔⠁⢱⠀⠀⠀⠀⠀⠑⢄⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠀⠀⢣⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⡄⠀⠀⠀⠀⠀⠀⠀⠉⢱⠓⠢⠤⢄⣀⡀⠀⡠⠃⠀⠀⠀⢇⠀⠀⠀⠀⠀⠈⢢⠀⠀⠀⠀⠀⠀
            ⡁⠀⠀⠀⠀⢇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⢄⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠈⡝⠉⠑⠒⠒⠢⠼⡤⠤⢄⣀⣀⣀⣀⡱⡀⠀⠀⠀⠀
            ⡄⢀⠀⡀⢀⠘⡄⢀⠀⡀⢀⠀⡀⢀⠀⡀⢈⢆⡀⢀⠀⡀⢀⡸⡀⢀⠀⡀⢀⢀⡎⢀⠀⡀⢀⠀⡀⢀⢣⡀⢀⠀⡀⢀⠀⡈⢙⡍⡉⢉⠁
            ⠂⠀⠀⠀⠀⠀⢱⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢢⠀⠀⠀⢠⠃⠀⠀⠀⠀⡠⠊⠀⠀⠀⠀⠀⠀⠀⠀⠈⡆⠀⠀⠀⠀⠀⠀⠀⠘⢄⠀⠀
            ⡁⠀⠀⠀⠀⠀⠀⢇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠑⢄⠀⡜⠀⠀⠀⢀⠔⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⠀⠀⠀⠀⠀⠀⠀⠀⠈⢢⠀
            ⠄⠀⠀⠀⠀⠀⠀⠘⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢱⠣⠤⠤⠒⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠁
            ⠂⠀⠀⠀⠀⠀⠀⠀⢱⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⠀⠀⠀⠀⠀⠀⠀⢇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡸⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠱⡀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⠀⠀⠀⠀⠀⠀⠀⠀⠘⡄⠀⠀⠀⠀⠀⠀⠀⠀⢠⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢣⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⡄⠀⠀⠀⠀⠀⠀⢀⠇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢣⠀⠀⠀⠀⠀⡠⠂
            ⡁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠱⡀⠀⠀⠀⠀⢀⠎⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠑⢄⠀⢀⡰⠁⠀
            ⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⢄⡀⠀⡠⠊⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠁⠀⠀⠀
            ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀ -1.8
            0.0                                           10.0
            "]];
        expected.assert_eq(&textplot_ode_result(&problem, &result));
    }
}
