//! Polynomial differential equations.

use std::collections::BTreeMap;
use std::fmt::Display;
use std::ops::Add;

use derivative::Derivative;
use nalgebra::DVector;
use num_traits::{One, Pow, Zero};

#[cfg(test)]
use super::ODEProblem;
use super::ODESystem;
use crate::zero::alg::Polynomial;

/// A system of polynomial differential equations.
#[derive(Clone, Derivative)]
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
        self.map(|poly| poly.extend_scalars(f.clone()))
    }

    /// Maps the variables of the polynomials comprising the system.
    pub fn map_variables<NewVar, F>(&self, mut f: F) -> PolynomialSystem<NewVar, Coef, Exp>
    where
        NewVar: Clone + Ord,
        Coef: Clone + Add<Output = Coef>,
        Exp: Clone + Add<Output = Exp>,
        F: FnMut(&Var) -> NewVar,
    {
        let components = self
            .components
            .iter()
            .map(|(var, poly)| {
                let new_var = f(var);
                (new_var, poly.map_variables(|v| f(v)))
            })
            .collect();
        PolynomialSystem { components }
    }

    /// Normalizes the polynomial system by normalizing each polynomial in it.
    pub fn normalize(self) -> Self
    where
        Coef: Zero,
        Exp: Zero,
    {
        self.map(|poly| poly.normalize())
    }

    /// Maps over the components of the system.
    pub fn map<NewCoef, NewExp, F>(self, mut f: F) -> PolynomialSystem<Var, NewCoef, NewExp>
    where
        F: FnMut(Polynomial<Var, Coef, Exp>) -> Polynomial<Var, NewCoef, NewExp>,
    {
        let components = self.components.into_iter().map(|(var, poly)| (var, f(poly))).collect();
        PolynomialSystem { components }
    }
}

impl<Var, Exp> PolynomialSystem<Var, f32, Exp>
where
    Var: Clone + Ord,
    Exp: Clone + Ord + Add<Output = Exp>,
{
    /// Converts the polynomial system to a numerical one.
    ///
    /// The order of the components in the new system is given by the order of the
    /// variables in the old one.
    pub fn to_numerical(&self) -> NumericalPolynomialSystem<Exp> {
        let indices: BTreeMap<Var, usize> =
            self.components.keys().enumerate().map(|(i, var)| (var.clone(), i)).collect();
        let components = self
            .components
            .values()
            .map(|poly| poly.map_variables(|var| *indices.get(var).unwrap()))
            .collect();
        NumericalPolynomialSystem { components }
    }
}

/// Trait for converting to LaTeX strings. We are using 2D vectors for laying them out as tables
/// down the line.
pub trait ToLatex {
    /// Converts to a 2D vector of LaTeX strings.
    fn to_latex(&self) -> Vec<Vec<String>>;
}

impl<Var, Coef, Exp> Display for PolynomialSystem<Var, Coef, Exp>
where
    Var: Display,
    Coef: Display + PartialEq + One,
    Exp: Display + PartialEq + One,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        for (var, component) in self.components.iter() {
            writeln!(f, "d{var} = {component}")?;
        }
        Ok(())
    }
}

impl<Var, Coef, Exp> ToLatex for PolynomialSystem<Var, Coef, Exp>
where
    Var: Display,
    Coef: Display + PartialEq + One,
    Exp: Display + PartialEq + One,
{
    fn to_latex(&self) -> Vec<Vec<String>> {
        let mut result = Vec::new();
        for (var, poly) in self.components.iter() {
            let mut row = Vec::new();
            row.push(format!("\\dot{{{var}}}"));
            row.push("=".to_string());
            row.push(poly.to_string());
            result.push(row);
        }
        result
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

/// A numerical system of polynomial differential equations.
///
/// Such a system is ready for use in numerical solvers: the coefficients are
/// floating point numbers and the variables are consecutive integer indices.
pub struct NumericalPolynomialSystem<Exp> {
    /// Components of the vector field.
    pub components: Vec<Polynomial<usize, f32, Exp>>,
}

impl<Exp> ODESystem for NumericalPolynomialSystem<Exp>
where
    Exp: Clone + Ord,
    f32: Pow<Exp, Output = f32>,
{
    fn vector_field(&self, dx: &mut DVector<f32>, x: &DVector<f32>, _t: f32) {
        for i in 0..dx.len() {
            dx[i] = self.components[i].eval(|var| x[*var])
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
            dI = (-γ) I + β I S
            dR = γ I
            dS = (-β) I S
        "#]];
        expected.assert_eq(&sys.to_string());

        let sys = sys.extend_scalars(|p| p.eval(|_| 1.0));
        let expected = expect![[r#"
            dI = -I + I S
            dR = I
            dS = -I S
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
