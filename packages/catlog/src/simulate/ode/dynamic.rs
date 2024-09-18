/*! Ordinary differential equations specified dynamically.

By specified dynamically, we mean that the vector fields are defined by
mathematical expressions provided at runtime rather than compile-time.
 */

use nalgebra::DVector;

use super::ODESystem;
use crate::simulate::mathexpr::{compile, run, Context, Env, Errors, Prog};

/// A numerical quantity in an ODE.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Quantity {
    /// A parameter, assumed to be constant in time.
    Param(usize),

    /// A state variable.
    State(usize),
}

struct VectorFieldEnv<'a, 'b> {
    params: &'a [f32],
    state: &'b [f32],
}

impl<'a, 'b> VectorFieldEnv<'a, 'b> {
    fn new(params: &'a [f32], state: &'b [f32]) -> Self {
        Self { params, state }
    }
}

impl<'a, 'b> Env for VectorFieldEnv<'a, 'b> {
    type Var = Quantity;

    fn lookup(&self, t: &Self::Var) -> f32 {
        match t {
            Quantity::Param(i) => self.params[*i],
            Quantity::State(i) => self.state[*i],
        }
    }
}

/// An ODE whose vector field is defined by expressions provided at runtime.
pub struct DynamicODE {
    params: Vec<f32>,
    progs: Vec<Prog<Quantity>>,
}

impl DynamicODE {
    /** Construct a system of ODEs from the given source expressions.

    Returns an error message if the compilation of the mathematical expression fails.
     */
    pub fn new(
        params: &[(&str, f32)],
        prog_sources: &[(&str, &str)],
    ) -> Result<DynamicODE, Errors> {
        let mut errors = Vec::new();

        let ctx = Context::new(
            &params
                .iter()
                .enumerate()
                .map(|(i, (p, _))| (*p, Quantity::Param(i)))
                .chain(prog_sources.iter().enumerate().map(|(i, (v, _))| (*v, Quantity::State(i))))
                .collect::<Vec<(&str, Quantity)>>(),
        );

        let mut progs = Vec::new();
        for (_, src) in prog_sources.iter() {
            match compile(&ctx, src) {
                Ok(p) => progs.push(p),
                Err(e) => errors.extend(e.0.into_iter()),
            }
        }

        if errors.is_empty() {
            Ok(DynamicODE {
                params: params.iter().map(|(_, x)| *x).collect(),
                progs,
            })
        } else {
            Err(Errors(errors))
        }
    }
}

impl ODESystem for DynamicODE {
    fn vector_field(&self, dy: &mut DVector<f32>, y: &DVector<f32>, _: f32) {
        let env = VectorFieldEnv::new(&self.params, y.as_slice());
        for (prog, dyi) in self.progs.iter().zip(dy.as_mut_slice().iter_mut()) {
            *dyi = run(&env, prog);
        }
    }
}

#[cfg(test)]
mod test {
    use expect_test::{expect, Expect};
    use nalgebra::DVector;
    use textplots::{Chart, Plot, Shape};

    use super::super::ODEProblem;
    use super::*;

    fn check_chart(chart: &mut Chart, expected: Expect) {
        chart.axis();
        chart.figures();
        expected.assert_eq(&format!("{}", chart));
    }

    #[test]
    fn lotka_volterra_predator_prey() {
        let sys = DynamicODE::new(
            &[("α", 2.0), ("β", 1.0), ("γ", 1.0), ("δ", 1.0)],
            &[("x", "α * x - β * x * y"), ("y", "- γ * y + δ * x * y")],
        )
        .unwrap();

        let y = DVector::from_column_slice(&[1.0, 1.0]);
        let mut dy = DVector::from_column_slice(&[0.0, 0.0]);
        sys.vector_field(&mut dy, &y, 0.0);
        assert_eq!(dy.as_slice(), &[1.0, 0.0]);

        let problem = ODEProblem::new(sys, y).end_time(10.0);
        let result = problem.solve_rk4(0.1).unwrap();
        let (x_out, y_out) = result.get();

        check_chart(
            Chart::new(100, 80, 0.0, 10.0)
                .lineplot(&Shape::Lines(
                    &x_out.iter().copied().zip(y_out.iter().map(|y| y[0])).collect::<Vec<_>>(),
                ))
                .lineplot(&Shape::Lines(
                    &x_out.iter().copied().zip(y_out.iter().map(|y| y[1])).collect::<Vec<_>>(),
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
