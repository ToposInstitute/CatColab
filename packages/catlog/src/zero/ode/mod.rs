//! Data structures and functions for dynamically solving ODEs from runtime-provided expressions
//! for vector fields.

use super::mathexpr::{compile, run, Context, Env, Error, Errors, Prog};
use nalgebra::DVector;
use ode_solvers;
use std::fmt::Write as _;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Var {
    Param(usize),
    State(usize),
}

struct VFieldEnv<'a, 'b> {
    params: &'a [f32],
    state: &'b [f32],
}

impl<'a, 'b> VFieldEnv<'a, 'b> {
    fn new(params: &'a [f32], state: &'b [f32]) -> Self {
        Self { params, state }
    }
}

impl<'a, 'b> Env for VFieldEnv<'a, 'b> {
    type Var = Var;

    fn lookup(&self, t: &Self::Var) -> f32 {
        match t {
            Var::Param(i) => self.params[*i],
            Var::State(i) => self.state[*i],
        }
    }
}

/// An ODE whose corresponding vector field is given by runtime-provided expressions
pub struct DynamicODE {
    params: Vec<f32>,
    progs: Vec<Prog<Var>>,
}

impl ode_solvers::System<f32, DVector<f32>> for DynamicODE {
    fn system(&self, _: f32, y: &DVector<f32>, dy: &mut DVector<f32>) {
        let env = VFieldEnv::new(&self.params, y.as_slice());
        for (prog, dyi) in self.progs.iter().zip(dy.as_mut_slice().iter_mut()) {
            *dyi = run(&env, prog);
        }
    }
}

impl DynamicODE {
    /// Construct a DynamicODE with given parameters and with given source expressions to compute
    /// the ODE.
    ///
    /// Might return an error message instead.
    pub fn new(
        params: &[(&str, f32)],
        prog_sources: &[(&str, &str)],
    ) -> Result<DynamicODE, Errors> {
        let mut errors = Vec::new();

        let ctx = Context::new(
            &params
                .iter()
                .enumerate()
                .map(|(i, (p, _))| (*p, Var::Param(i)))
                .chain(prog_sources.iter().enumerate().map(|(i, (v, _))| (*v, Var::State(i))))
                .collect::<Vec<(&str, Var)>>(),
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

#[cfg(test)]
mod test {
    use super::DynamicODE;
    use indoc::indoc;
    use nalgebra::DVector;
    use ode_solvers::Rk4;
    use ode_solvers::System as _;
    use textplots::{Chart, Plot, Shape};

    fn chart_to_string(c: &mut Chart) -> String {
        c.axis();
        c.figures();

        format!("{}", c)
    }

    #[test]
    fn lotka_volterra() {
        let sys = DynamicODE::new(
            &[("α", 2.0), ("β", 1.0), ("γ", 1.0), ("δ", 1.0)],
            &[("x", "α * x - β * x * y"), ("y", "- γ * y + δ * x * y")],
        )
        .unwrap();

        let y = DVector::from_column_slice(&[1.0, 1.0]);
        let mut dy = DVector::from_column_slice(&[0.0, 0.0]);

        sys.system(0.0, &y, &mut dy);

        assert_eq!(dy.as_slice(), &[1.0, 0.0]);

        let mut stepper = Rk4::new(sys, 0.0, y, 10.0, 0.1);

        stepper.integrate().unwrap();

        let plot = chart_to_string(
            Chart::new(100, 80, 0.0, 10.0)
                .lineplot(&Shape::Lines(
                    &stepper
                        .x_out()
                        .iter()
                        .copied()
                        .zip(stepper.y_out().iter().map(|y| y[0]))
                        .collect::<Vec<(f32, f32)>>(),
                ))
                .lineplot(&Shape::Lines(
                    &stepper
                        .x_out()
                        .iter()
                        .copied()
                        .zip(stepper.y_out().iter().map(|y| y[1]))
                        .collect::<Vec<(f32, f32)>>(),
                )),
        );

        assert_eq!(
            &plot,
            indoc! { r#"
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
            "#}
        );
    }
}
