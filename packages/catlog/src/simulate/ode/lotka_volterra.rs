//! Lotka-Volterra differential equations.

use nalgebra::{DMatrix, DVector};

#[cfg(test)]
use super::ODEProblem;
use super::ODESystem;

/** A Lotka-Volterra dynamical system.

A system of ODEs that is affine in its *logarithmic* derivative. These are
sometimes called the "generalized Lotka-Volterra equations." For more, see
[Wikipedia](https://en.wikipedia.org/wiki/Generalized_Lotka%E2%80%93Volterra_equation).
*/
#[derive(Clone, Debug, PartialEq)]
pub struct LotkaVolterraSystem {
    interaction_coeffs: DMatrix<f32>,
    growth_rates: DVector<f32>,
}

impl LotkaVolterraSystem {
    /// Create a new Lokta-Volterra system.
    pub fn new(A: DMatrix<f32>, b: DVector<f32>) -> Self {
        Self {
            interaction_coeffs: A,
            growth_rates: b,
        }
    }
}

impl ODESystem for LotkaVolterraSystem {
    fn vector_field(&self, dx: &mut DVector<f32>, x: &DVector<f32>, _t: f32) {
        let A = &self.interaction_coeffs;
        let b = &self.growth_rates;
        *dx = (A * x + b).component_mul(x);
    }

    fn alt_vector_field(
        &self,
        dx: &mut diffsol::NalgebraVec<f64>,
        x: &diffsol::NalgebraVec<f64>,
        _t: f64,
    ) {
    }
}

#[cfg(test)]
pub(crate) fn create_predator_prey() -> ODEProblem<LotkaVolterraSystem> {
    let A = DMatrix::from_row_slice(2, 2, &[0.0, -1.0, 1.0, 0.0]);
    let b = DVector::from_column_slice(&[2.0, -1.0]);
    let sys = LotkaVolterraSystem::new(A, b);

    let x0 = DVector::from_column_slice(&[1.0, 1.0]);
    ODEProblem::new(sys, x0).end_time(10.0)
}

#[cfg(test)]
mod tests {
    use expect_test::expect;

    use super::super::textplot_ode_result;
    use super::*;

    #[test]
    fn predator_prey() {
        let problem = create_predator_prey();
        let result = problem.solve_rk4(0.1).unwrap();
        let expected = expect![["
                ⡁⠀⠀⠀⠀⠀⠀⠀⢠⠊⢢⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠎⠱⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀ 3.5
                ⠄⠀⠀⠀⠀⠀⠀⠀⡇⠀⠈⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡜⠀⠀⢣⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
                ⠂⠀⠀⠀⠀⠀⠀⢸⠀⠀⠀⢸⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠇⠀⠀⠘⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
                ⡁⠀⠀⠀⠀⠀⠀⡎⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⠀⠀⠀⠀⢱⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
                ⠄⠀⠀⠀⠀⠀⢀⠇⠀⠀⠀⠀⢸⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠈⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
                ⠂⠀⠀⠀⠀⠀⢸⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠇⠀⠀⠀⠀⠀⢱⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
                ⡁⠀⠀⠀⠀⠀⡎⠀⠀⠀⠀⠀⠀⠸⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⠀⠀⠀⠀⠀⠀⠈⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
                ⠄⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀⢇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡎⠀⠀⠀⠀⠀⠀⠀⢱⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
                ⠂⠀⠀⠀⠀⣸⡀⠀⠀⠀⠀⠀⠀⠀⠸⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡇⠀⠀⠀⠀⠀⠀⠀⠈⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
                ⡁⠀⠀⠀⡎⡜⢣⠀⠀⠀⠀⠀⠀⠀⠀⢣⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡰⢹⠸⡀⠀⠀⠀⠀⠀⠀⠀⠸⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
                ⠄⠀⠀⡸⠀⡇⠈⡆⠀⠀⠀⠀⠀⠀⠀⠈⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⠁⡜⠀⢇⠀⠀⠀⠀⠀⠀⠀⠀⢣⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠄
                ⠂⠀⢠⠃⢸⠀⠀⢱⠀⠀⠀⠀⠀⠀⠀⠀⠸⡀⠀⠀⠀⠀⠀⠀⠀⠀⡎⢀⠇⠀⠸⡀⠀⠀⠀⠀⠀⠀⠀⠈⡆⠀⠀⠀⠀⠀⠀⠀⠀⡸⠀
                ⡁⠀⡎⠀⡎⠀⠀⠘⡄⠀⠀⠀⠀⠀⠀⠀⠀⢱⠀⠀⠀⠀⠀⠀⠀⡸⠀⡸⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀⠀⠘⡄⠀⠀⠀⠀⠀⠀⢠⠃⠀
                ⠄⢰⠁⢰⠁⠀⠀⠀⢇⠀⠀⠀⠀⠀⠀⠀⠀⠀⢣⠀⠀⠀⠀⠀⢀⠇⢀⠇⠀⠀⠀⢸⠀⠀⠀⠀⠀⠀⠀⠀⠀⠱⡀⠀⠀⠀⠀⠀⡎⠀⠀
                ⢂⠇⢀⠇⠀⠀⠀⠀⢸⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠱⡀⠀⠀⠀⡜⠀⡜⠀⠀⠀⠀⠈⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⢄⠀⠀⠀⢰⠁⡰⠁
                ⡝⡠⠊⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠢⣀⢰⣁⠜⠀⠀⠀⠀⠀⠀⢱⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠢⣀⢀⢇⡰⠁⠀
                ⠍⠀⠀⠀⠀⠀⠀⠀⠀⠸⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⠋⠀⠀⠀⠀⠀⠀⠀⠀⠈⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡏⠁⠀⠀⠀
                ⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⢣⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡜⠀⠀⠀⠀⠀
                ⡁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢆⠀⠀⠀⠀⠀⠀⠀⠀⡠⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠱⡀⠀⠀⠀⠀⠀⠀⠀⢀⠎⠀⠀⠀⠀⠀⠀
                ⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠑⢄⡀⠀⠀⢀⡠⠊⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠑⢄⡀⠀⠀⢀⡠⠔⠁⠀⠀⠀⠀⠀⠀⠀
                ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠉⠉⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠉⠉⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀ 0.4
                0.0                                           10.0
            "]];
        expected.assert_eq(&textplot_ode_result(&problem, &result));
    }
}
