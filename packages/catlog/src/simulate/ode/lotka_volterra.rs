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
    fn vector_field(&self, dx: &mut DVector<f32>, x: &DVector<f32>, _: f32) {
        let A = &self.interaction_coeffs;
        let b = &self.growth_rates;
        *dx = (A * x + b).component_mul(x);
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
mod test {
    use expect_test::{expect, Expect};
    use textplots::{Chart, Plot, Shape};

    use super::*;

    fn check_chart(chart: &mut Chart, expected: Expect) {
        chart.axis();
        chart.figures();
        expected.assert_eq(&format!("{}", chart));
    }

    #[test]
    fn predator_prey() {
        let problem = create_predator_prey();
        let result = problem.solve_rk4(0.1).unwrap();
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
