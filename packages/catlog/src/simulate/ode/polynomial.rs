//! Polynomial differential equations.

use std::collections::BTreeMap;
use std::collections::HashMap;
use std::fmt::Display;
use std::ops::Add;

use derivative::Derivative;
use nalgebra::DVector;
use num_traits::{One, Pow};

// TODO delete
use ustr::{ustr, IdentityHasher, Ustr};

use super::StateBehavior;

#[cfg(test)]
use super::ODEProblem;
use super::ODESystem;
use crate::zero::alg::Polynomial;

/// Functions that may be attached to a monomial
#[derive(Clone, Debug)]
pub enum MonomialBehavior<Var> {
    Identity,
    Heaviside(Var, Var),
}

impl<Var> Default for MonomialBehavior<Var> {
    fn default() -> Self {
        MonomialBehavior::Identity
    }
}

/// A system of polynomial differential equations.
#[derive(Clone, Debug, Derivative)]
#[derivative(Default(bound = ""))]
pub struct PolynomialSystem<Var, Coef, Exp> {
    /// Components of the vector field.
    pub components: BTreeMap<Var, Polynomial<Var, Coef, Exp>>,
}

impl<Var, Coef, Exp> PolynomialSystem<Var, Coef, Exp>
where
    Var: Ord,
    Exp: Ord,
{
    /// Constructs a new polynomial system, with no equations.
    pub fn new() -> Self {
        Default::default()
    }

    /// Adds a new term to the system.
    pub fn add_term(&mut self, var: Var, term: Polynomial<Var, Coef, Exp>)
    where
        Coef: Add<Output = Coef>,
    {
        if let Some(component) = self.components.get_mut(&var) {
            *component = std::mem::take(component) + term;
        } else {
            self.components.insert(var, term);
        }
    }

    /// Maps the cofficients of the polynomials comprising the system.
    pub fn extend_scalars<NewCoef, F>(self, f: F) -> PolynomialSystem<Var, NewCoef, Exp>
    where
        F: Clone + FnMut(Coef) -> NewCoef,
    {
        let components = self
            .components
            .into_iter()
            .map(|(var, poly)| (var, poly.extend_scalars(f.clone())))
            .collect();
        PolynomialSystem { components }
    }
}

impl<Var, Exp> PolynomialSystem<Var, f32, Exp>
where
    Var: Clone + Ord + std::fmt::Debug,
    Exp: Clone + Ord + Add<Output = Exp> + std::fmt::Debug,
{
    /** Converts the polynomial system to a numerical one.

    The order of the components in the new system is given by the order of the
    variables in the old one.
     */
    pub fn to_numerical(&self) -> NumericalPolynomialSystem<Exp> {
        let indices: BTreeMap<Var, usize> =
            self.components.keys().enumerate().map(|(i, var)| (var.clone(), i)).collect();
        let components = self
            .components
            .values()
            .map(|poly| {
                poly.map_variables(|var| {
                    // We know in our water_volume example that Sediment and Water
                    // have a Heaviside step function [W-C], an element of R^n --> Bool,
                    // so for demo purposes I hardcode that here. It would be better to
                    // handle this when we extend_scalars/eval
                    // if indices[var] == 1 || indices[var] == 3 {
                    //     let _ = closures.insert(
                    //         indices[var],
                    //         MonomialBehavior::Heaviside(ustr("Water"), ustr("Container"))
                    //             .to_closure(indices.clone()),
                    //         // Box::new(|x: DVector<f32>| -> f32 {
                    //         //     if let Some(water) = indices.get(u!("Water")) else { panic!("!") };
                    //         //     if let Some(container) = indices.get(u!("Container")) else { panic!("!") };
                    //         //     let x[water] <= x[container] as u32 as f32
                    //         // }),
                    //     );
                    // }
                    *indices.get(var).unwrap()
                })
            })
            .collect();
        NumericalPolynomialSystem {
            components,
            closures: HashMap::new(),
        }
    }
}

impl<Var, Coef, Exp> Display for PolynomialSystem<Var, Coef, Exp>
where
    Var: Display,
    Coef: Display + PartialEq + One,
    Exp: Display + PartialEq + One,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        for (var, component) in self.components.iter() {
            writeln!(f, "d{} = {}", var, component)?;
        }
        Ok(())
    }
}

impl<Var, Coef, Exp> FromIterator<(Var, Polynomial<Var, Coef, Exp>)>
    for PolynomialSystem<Var, Coef, Exp>
where
    Var: Ord,
    Coef: Add<Output = Coef>,
    Exp: Ord,
{
    fn from_iter<T: IntoIterator<Item = (Var, Polynomial<Var, Coef, Exp>)>>(iter: T) -> Self {
        let mut system: Self = Default::default();
        for (var, term) in iter {
            system.add_term(var, term);
        }
        system
    }
}

/** A numerical system of polynomial differential equations.

Such a system is ready for use in numerical solvers: the coefficients are
floating point numbers and the variables are consecutive integer indices.
 */
pub struct NumericalPolynomialSystem<Exp> {
    /// Components of the vector field.
    pub components: Vec<Polynomial<usize, f32, Exp>>,
    /// Closures
    pub closures: HashMap<usize, StateBehavior<f32>>,
}

impl<Exp> ODESystem for NumericalPolynomialSystem<Exp>
where
    Exp: Clone + Ord + std::fmt::Debug,
    f32: Pow<Exp, Output = f32>,
{
    fn vector_field(&self, dx: &mut DVector<f32>, x: &DVector<f32>, _t: f32) {
        // 0: Container
        // 1: Sediment (deposited)
        // 2: Inflow (from huge reservoir)
        // 3: Water
        // where dW or dS = \pm [W-C],
        for i in 0..dx.len() {
            dx[i] = self.components[i].eval(|var| {
                // let modifier = 1.0;
                let modifier = if let Some(f) = self.closures.get(var) {
                    f(x.clone())
                } else {
                    1.0
                };
                let val = x[*var];
                modifier * val
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use expect_test::expect;

    use super::super::textplot_ode_result;
    use super::*;

    type Parameter<Id> = Polynomial<Id, f32, u8>;

    #[test]
    fn sir() {
        let param = |c: char| Parameter::<_>::generator(c);
        let var = |c: char| Polynomial::<_, Parameter<_>, u8>::generator(c);
        let terms = [
            ('S', -var('S') * var('I') * param('β')),
            ('I', var('S') * var('I') * param('β')),
            ('I', -var('I') * param('γ')),
            ('R', var('I') * param('γ')),
        ];
        let sys: PolynomialSystem<_, _, _> = terms.into_iter().collect();
        let expected = expect![[r#"
            dI = ((-1) γ) I + β I S
            dR = γ I
            dS = ((-1) β) I S
        "#]];
        expected.assert_eq(&sys.to_string());

        let sys = sys.extend_scalars(|p| p.eval(|_| 1.0));
        let expected = expect![[r#"
            dI = (-1) I + I S
            dR = I
            dS = (-1) I S
        "#]];
        expected.assert_eq(&sys.to_string());

        let initial = DVector::from_column_slice(&[1.0, 0.0, 4.0]);
        let problem = ODEProblem::new(sys.to_numerical(), initial).end_time(5.0);
        let result = problem.solve_rk4(0.1).unwrap();
        let expected = expect![[r#"
            ⡁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣀⠤⠤⠤⠒⠒⠒⠒⠒⠉⠉⠉⠉⠁ 4.9
            ⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⠤⠒⠒⠉⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⠤⠒⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠤⠊⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⢇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡠⠒⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠚⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡠⠊⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⢣⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠎⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⠘⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡔⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⢣⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠎⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⠘⡄⠀⢀⠤⠒⠤⡀⠀⢠⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⠀⠀⢣⡔⠁⠀⠀⠀⠈⢦⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠀⡜⡄⠀⠀⠀⠀⢠⠃⠑⢄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⡸⠀⢣⠀⠀⠀⢠⠃⠀⠀⠀⠣⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⢠⠃⠀⠘⡄⠀⢠⠃⠀⠀⠀⠀⠀⠈⠢⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⢂⠇⠀⠀⠀⠱⣠⠃⠀⠀⠀⠀⠀⠀⠀⠀⠈⠢⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡝⠀⠀⠀⠀⢠⢣⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠢⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠅⠀⠀⠀⢠⠃⠀⢣⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠑⠤⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠀⢠⠃⠀⠀⠀⠣⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠒⠤⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⡠⠃⠀⠀⠀⠀⠀⠈⠒⠤⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠒⠒⠤⠤⣀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⢄⠔⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠒⠒⠤⠤⠤⠤⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣉⣉⣒⣒⣒⣒⣤⣤⣤⣤⠤⣀⣀⣀⣀⡀
            ⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠉⠉⠉⠉⠉⠁ 0.0
            0.0                                            5.0
        "#]];
        expected.assert_eq(&textplot_ode_result(&problem, &result));
    }
}
