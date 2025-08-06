//! Polynomial differential equations.

use std::cmp::{Eq, Ord};
use std::collections::{BTreeMap, HashMap};
use std::fmt::{Debug, Display};
use std::hash::Hash;
use std::ops::Add;

use itertools::{EitherOrBoth::*, Itertools};

use derivative::Derivative;
use nalgebra::DVector;
use num_traits::{One, Pow, Zero};

use crate::stdlib::analyses::ode::{ComputeGraph, EligibleFunctions, Output};

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
            .map(|poly| poly.map_variables(|var| *indices.get(var).unwrap()))
            .collect();
        NumericalPolynomialSystem { components }
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
            writeln!(f, "d{var} = {component}")?;
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
#[derive(Clone)]
pub struct NumericalPolynomialSystem<Exp> {
    /// Components of the vector field.
    pub components: Vec<Polynomial<usize, f32, Exp>>,
}

impl<Exp> Add for NumericalPolynomialSystem<Exp>
where
    Exp: Ord,
{
    type Output = Self;

    fn add(self, rhs: Self) -> Self::Output {
        let components = self
            .components
            .into_iter()
            .zip_longest(rhs.components.into_iter())
            .map(|pair| match pair {
                Both(l, r) => l + r,
                Left(x) | Right(x) => x,
            })
            .collect::<Vec<_>>();
        Self { components }
    }
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

/**
 */
#[derive(Clone, Derivative)]
#[derivative(Default(bound = ""))]
pub struct NumericalPolynomialSwitchingSystem<Id, Exp>
where
    Id: Hash + Clone + Eq + Debug,
    Exp: Clone,
{
    ///
    pub ob_index: BTreeMap<Id, usize>,

    // TODO public?
    /// Null model
    pub null_model: Option<NumericalPolynomialSystem<Exp>>,

    /// Components of a switching system.
    pub subsystems: Vec<(ComputeGraph<Id>, NumericalPolynomialSystem<Exp>)>,

    /// Analysis data
    pub functions: HashMap<Id, String>,
}

impl<Id, Exp> NumericalPolynomialSwitchingSystem<Id, Exp>
where
    Id: Hash + Clone + Eq + Debug + Ord,
    Exp: Ord + Clone,
{
    // TODO do we need a `null_model`?
    fn get_current(self, x: DVector<f32>) -> NumericalPolynomialSystem<Exp> {
        self.subsystems
            .into_iter()
            .filter(|(graph, _)| graph.compute(&x, self.functions.clone(), self.ob_index.clone()))
            .fold(self.null_model.unwrap(), |acc, (_, sys)| acc + sys)
    }
}

// impl<Id: Hash + Clone + Eq + Debug, Exp> From<NumericalPolynomialSystem<Exp>>
//     for NumericalPolynomialSwitchingSystem<Id, Exp>
// where
//     Exp: Clone,
// {
//     fn from(nps: NumericalPolynomialSystem<Exp>) -> Self {
//         let subsystems = vec![(ComputeGraph::<Id>::new(), nps)];
//         let functions = HashMap::from([(ustr::ustr("comparator"), EligibleFunctions::Geq())]);
//         NumericalPolynomialSwitchingSystem {
//             subsystems,
//             functions,
//         }
//     }
// }

impl<Id> ComputeGraph<Id>
where
    Id: Eq + Hash + Debug + Clone + Ord,
{
    //
    fn compute(
        &self,
        x: &DVector<f32>,
        functions: HashMap<Id, String>,
        ob_index: BTreeMap<Id, usize>,
    ) -> bool {
        // binding name
        let mut bindings: Vec<(_, Output)> = Default::default();
        for var in self.toposort.iter() {
            if self.obs.contains(&var) {
                let index = ob_index[var];
                bindings.push((var, Output::Float(x[index])));
            } else if self.borrows.keys().contains(&var) {
                let index = ob_index[&self.borrows[var]];
                bindings.push((var, Output::Float(x[index])));
            } else if let Some(val) = self.auxes.get(&var) {
                bindings.push((var, Output::Float(*val)));
            } else if self.funcs.keys().contains(&var) {
                let args = &self.funcs[&var]
                    .clone()
                    .into_iter()
                    .map(|arg| self.fetch(x, arg, ob_index.clone()))
                    .collect::<Vec<_>>();
                let out = if let Some(function) = functions.get(&var) {
                    let res = &args[0] >= &args[1];
                    match function.as_str() {
                        "Identity" => Output::Bool(true), // do nothing
                        "Geq" => Output::Bool(args[0] >= args[1]),
                        _ => Output::Float(args[0]),
                    }
                } else {
                    Output::Bool(true)
                };
                bindings.push((var, out));
            }
        }
        if let Some((_, value)) = bindings.last() {
            match value {
                Output::Bool(x) => *x,
                _ => false,
            }
        } else {
            true
        }
    }

    // TODO parameterize
    fn fetch(&self, x: &DVector<f32>, arg: Id, ob_index: BTreeMap<Id, usize>) -> f32 {
        if self.obs.contains(&arg) {
            x[ob_index[&arg]]
        } else if self.borrows.keys().contains(&arg) {
            x[ob_index[&self.borrows[&arg]]]
        } else {
            7f32 // TODO remove
        }
    }
}

// impl<Id, Var, Exp> From<Vec<(ComputeGraph<Id>, PolynomialSystem<Var, f32, Exp>)>>
//     for NumericalPolynomialSwitchingSystem<Id, Exp>
// where
//     Var: Ord,
//     Exp: Ord,
//     Id: Hash + Clone + Eq + Debug,
// {
//     fn from(subsystems: Vec<(ComputeGraph<Id>, PolynomialSystem<Var, Coef, Exp>)>) -> Self {
//         let subsystems = subsystems
//             .into_iter()
//             .map(|(id, poly)| (id, poly.to_numerical()))
//             .collect::<Vec<_>>();
//         NumericalPolynomialSwitchingSystem { subsystems }
//     }
// }

impl<Id, Exp> ODESystem for NumericalPolynomialSwitchingSystem<Id, Exp>
where
    Exp: Clone + Ord + Display + num_traits::One,
    f32: Pow<Exp, Output = f32>,
    Id: Eq + Hash + Ord + Clone + Debug,
{
    fn vector_field(&self, dx: &mut DVector<f32>, x: &DVector<f32>, _t: f32) {
        let subsystem = self.clone().get_current(x.clone());
        for i in 0..dx.len() {
            dx[i] = match subsystem.components.get(i) {
                Some(p) => p.eval(|var| x[*var]),
                None => 0f32,
            }
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

    #[test]
    fn water_simulation() {
        let th = std::rc::Rc::new(crate::stdlib::th_modal_state_aux());
        let model = crate::stdlib::water(th);
        let system = crate::stdlib::analyses::ode::PetriNetMassActionFunctionAnalysis::default()
            .build_switching_system(&model);

        let functions = HashMap::from([(ustr::ustr("comparator"), String::from("Geq"))]);
        let sys = system.to_numerical(functions);

        // container, lake, sediment, watershed
        let initial = DVector::from_column_slice(&[6.0, 4.0, 1.0, 4.0]);
        // let initial = DVector::from_column_slice(&[1.0, 2.0, 4.0]);
        let problem = ODEProblem::new(sys, initial).end_time(10.0);
        let result = problem.solve_rk4(0.1).unwrap();
        let expected = expect![[r#"
            ⡁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⠤⠒⠒⢣⠀⣀⠤⠤⠒⠒⠉⠒⠒⠒⠉⠉⠒⠒⠒⠒⠉⠉⠉⠉⠉⠒⠒⠒⠒⠒⠒⠂ 4.5
            ⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡠⠒⠉⠀⠀⠀⠀⠀⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠤⠊⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⣱⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡠⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⢇⠀⠀⠀⠀⠀⠀⠀⡠⠊⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠘⡄⠀⠀⠀⠀⠀⡔⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⠱⡀⠀⠀⠀⡜⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⠀⠀⢣⠀⢀⠎⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠀⠀⢇⠎⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣀⣀⣀⣀⡀
            ⡁⠀⠀⠀⡎⢆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣀⣀⣀⣀⣀⠤⠤⠤⠤⠤⠒⠒⠒⠒⠒⠒⠒⠒⠊⠀⠀⠀⠀⠀⠀⠀
            ⠄⠀⠀⡜⠀⠈⢆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⡜⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠒⠒⢲⠓⠒⠒⠚⢖⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠊⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⢀⠇⠀⠀⠀⠀⠀⠣⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⡜⠀⠀⠀⠀⠀⠀⠀⠑⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⢲⠁⠀⠀⠀⠀⠀⠀⠀⠀⠈⠢⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠢⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠒⠤⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠒⠤⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠒⠒⠤⣀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠉⠒⠒⠒⠤⠤⠤⠤⣀⣀⣀⣀⣀⣀⣀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠉⠉⠉⠉⠉⠉⠁ 0.0
            0.0                                            5.0
        "#]];
        expected.assert_eq(&textplot_ode_result(&problem, &result));
    }

    #[test]
    fn water_no_logic_simulation() {
        let th = std::rc::Rc::new(crate::stdlib::th_modal_state_aux());
        let model = crate::stdlib::water_no_logic(th);
        let system = crate::stdlib::analyses::ode::PetriNetMassActionFunctionAnalysis::default()
            .build_switching_system(&model);

        let functions = HashMap::from([(ustr::ustr("comparator"), String::from("Geq"))]);
        let sys = system.to_numerical(functions);

        // sediment, watershed, lake
        let initial = DVector::from_column_slice(&[1.0, 2.0, 4.0]);
        let problem = ODEProblem::new(sys, initial).end_time(10.0);
        let result = problem.solve_rk4(0.1).unwrap();
        let expected = expect![[r#"
            ⡁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⠤⠒⠒⢣⠀⣀⠤⠤⠒⠒⠉⠒⠒⠒⠉⠉⠒⠒⠒⠒⠉⠉⠉⠉⠉⠒⠒⠒⠒⠒⠒⠂ 4.5
            ⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡠⠒⠉⠀⠀⠀⠀⠀⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠤⠊⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⣱⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡠⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⢇⠀⠀⠀⠀⠀⠀⠀⡠⠊⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠘⡄⠀⠀⠀⠀⠀⡔⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⠱⡀⠀⠀⠀⡜⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⠀⠀⢣⠀⢀⠎⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠀⠀⢇⠎⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣀⣀⣀⣀⡀
            ⡁⠀⠀⠀⡎⢆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣀⣀⣀⣀⣀⠤⠤⠤⠤⠤⠒⠒⠒⠒⠒⠒⠒⠒⠊⠀⠀⠀⠀⠀⠀⠀
            ⠄⠀⠀⡜⠀⠈⢆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⡜⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠒⠒⢲⠓⠒⠒⠚⢖⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠊⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⢀⠇⠀⠀⠀⠀⠀⠣⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⡜⠀⠀⠀⠀⠀⠀⠀⠑⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⢲⠁⠀⠀⠀⠀⠀⠀⠀⠀⠈⠢⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠢⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠒⠤⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠒⠤⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠒⠒⠤⣀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠉⠒⠒⠒⠤⠤⠤⠤⣀⣀⣀⣀⣀⣀⣀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠉⠉⠉⠉⠉⠉⠁ 0.0
            0.0                                            5.0
        "#]];
        expected.assert_eq(&textplot_ode_result(&problem, &result));
    }
}
