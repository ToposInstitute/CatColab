//! Solve Lotka-Volterra differential equations.

use nalgebra::{DMatrix, DVector};

use ode_solvers;

/** A Lotka-Volterra dynamical system.

A system of ODEs that is affine in its *logarithmic* derivative. For more, see
[Wikipedia](https://en.wikipedia.org/wiki/Generalized_Lotka%E2%80%93Volterra_equation).
*/
#[derive(Clone, PartialEq)]
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

impl ode_solvers::System<f32, DVector<f32>> for &LotkaVolterraSystem {
    fn system(&self, _: f32, x: &DVector<f32>, dx: &mut DVector<f32>) {
        let A = &self.interaction_coeffs;
        let b = &self.growth_rates;
        *dx = (A * x + b).component_mul(x);
    }
}

#[cfg(test)]
mod test {
    use expect_test::{expect, Expect};
    use ode_solvers::dop_shared::SolverResult;
    use textplots::{Chart, Plot, Shape};

    use super::*;

    fn check_chart(chart: &mut Chart, expected: Expect) {
        chart.axis();
        chart.figures();
        expected.assert_eq(&format!("{}", chart));
    }

    #[test]
    fn predator_prey() {
        let A = DMatrix::from_row_slice(2, 2, &[0.0, -1.0, 1.0, 0.0]);
        let b = DVector::from_column_slice(&[2.0, -1.0]);
        let sys = LotkaVolterraSystem::new(A, b);

        let initial_values = DVector::from_column_slice(&[1.0, 1.0]);
        let mut stepper = ode_solvers::Rk4::new(&sys, 0.0, initial_values, 10.0, 0.1);
        assert!(stepper.integrate().is_ok());
        let result: SolverResult<_, _> = stepper.into();
        let (t_out, x_out) = result.get();

        check_chart(
            Chart::new(100, 80, 0.0, 10.0)
                .lineplot(&Shape::Lines(
                    &t_out.iter().copied().zip(x_out.iter().map(|x| x[0])).collect::<Vec<_>>(),
                ))
                .lineplot(&Shape::Lines(
                    &t_out.iter().copied().zip(x_out.iter().map(|x| x[1])).collect::<Vec<_>>(),
                )),
            expect![["
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
            "]],
        );
    }
}
