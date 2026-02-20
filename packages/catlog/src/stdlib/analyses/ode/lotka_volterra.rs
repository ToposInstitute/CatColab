//! Lotka-Volterra ODE analysis of models.
//!
//! The main entry point for this module is
//! [`lotka_volterra_analysis`](SignedCoefficientBuilder::lotka_volterra_analysis).

use std::collections::HashMap;
use std::hash::Hash;
use std::ops::Add;

use itertools::Itertools;
use nalgebra::{DMatrix, DVector, Scalar};

use num_traits::One;
#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::{ODEAnalysis, SignedCoefficientBuilder};
use crate::dbl::model::DiscreteDblModel;
use crate::simulate::ode::{NumericalPolynomialSystem, ODEProblem, PolynomialSystem};
use crate::zero::alg::Polynomial;
use crate::{
    one::QualifiedPath,
    zero::{QualifiedName, rig::Monomial},
};

/// Data defining a Lotka-Volterra ODE problem for a model.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct LotkaVolterraProblemData {
    /// Map from morphism IDs to interaction coefficients (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "interactionCoefficients"))]
    interaction_coeffs: HashMap<QualifiedName, f32>,

    /// Map from object IDs to growth rates (arbitrary real numbers).
    #[cfg_attr(feature = "serde", serde(rename = "growthRates"))]
    growth_rates: HashMap<QualifiedName, f32>,

    /// Map from object IDs to initial values (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "initialValues"))]
    initial_values: HashMap<QualifiedName, f32>,

    /// Duration of simulation.
    duration: f32,
}

/// Construct a Lotka-Volterra dynamical system.
///
/// A system of ODEs that is affine in its *logarithmic* derivative. These are
/// sometimes called the "generalized Lotka-Volterra equations." For more, see
/// [Wikipedia](https://en.wikipedia.org/wiki/Generalized_Lotka%E2%80%93Volterra_equation).
pub fn lotka_volterra_system<Var, Coef>(
    vars: &[Var],
    interaction_coeffs: DMatrix<Coef>,
    growth_rates: DVector<Coef>,
) -> PolynomialSystem<Var, Coef, u8>
where
    Var: Clone + Hash + Ord,
    Coef: Clone + Add<Output = Coef> + One + Scalar,
{
    PolynomialSystem {
        components: interaction_coeffs
            .row_iter()
            .zip(vars)
            .zip(&growth_rates)
            .map(|((row, i), r)| {
                (
                    i.clone(),
                    Polynomial::<_, Coef, _>::generator(i.clone())
                        * (row
                            .iter()
                            .zip(vars)
                            .map(|(a, j)| (a.clone(), Monomial::generator(j.clone())))
                            .collect::<Polynomial<_, _, _>>()
                            + r.clone()),
                )
            })
            .collect(),
    }
}

impl SignedCoefficientBuilder<QualifiedName, QualifiedPath> {
    /// Lotka-Volterra ODE analysis for a model of a double theory.
    ///
    /// The main application we have in mind is the Lotka-Volterra ODE semantics for
    /// signed graphs described in our [paper on regulatory
    /// networks](crate::refs::RegNets).
    pub fn lotka_volterra_analysis(
        &self,
        model: &DiscreteDblModel,
        data: LotkaVolterraProblemData,
    ) -> ODEAnalysis<NumericalPolynomialSystem<u8>> {
        let (matrix, ob_index) = self.build_matrix(model);
        let n = ob_index.len();

        let growth_rate_params = ob_index
            .keys()
            .map(|ob| [(1.0, Monomial::generator(ob.clone()))].into_iter().collect());
        let b = DVector::from_iterator(n, growth_rate_params);

        let initial_values = ob_index
            .keys()
            .map(|ob| data.initial_values.get(ob).copied().unwrap_or_default());
        let x0 = DVector::from_iterator(n, initial_values);

        let system = lotka_volterra_system(&ob_index.clone().into_keys().collect_vec(), matrix, b)
            .extend_scalars(|poly| {
                poly.eval(|id| {
                    data.interaction_coeffs
                        .get(id)
                        .or(data.growth_rates.get(id))
                        .copied()
                        .unwrap_or_default()
                })
            })
            .map(|p| p.normalize())
            .to_numerical();
        let problem = ODEProblem::new(system, x0).end_time(data.duration);
        ODEAnalysis::new(problem, ob_index)
    }
}

#[cfg(test)]
mod test {
    use std::rc::Rc;

    use super::*;
    use crate::simulate::ode::textplot_ode_result;
    use crate::stdlib;
    use crate::stdlib::analyses::ode::Parameter;
    use crate::{one::Path, zero::name};
    use expect_test::expect;
    use itertools::Itertools;
    use nalgebra::{dmatrix, dvector};

    fn predator_prey_from_theory() -> ODEProblem<NumericalPolynomialSystem<u8>> {
        let th = Rc::new(stdlib::theories::th_signed_category());
        let neg_feedback = stdlib::models::negative_feedback(th);

        let data = LotkaVolterraProblemData {
            interaction_coeffs: [(name("positive"), 1.0), (name("negative"), 1.0)]
                .into_iter()
                .collect(),
            growth_rates: [(name("x"), 2.0), (name("y"), -1.0)].into_iter().collect(),
            initial_values: [(name("x"), 1.0), (name("y"), 1.0)].into_iter().collect(),
            duration: 10.0,
        };
        SignedCoefficientBuilder::new(name("Object"))
            .add_positive(Path::Id(name("Object")))
            .add_negative(Path::single(name("Negative")))
            .lotka_volterra_analysis(&neg_feedback, data)
            .problem
    }

    fn predator_prey_from_matrix() -> ODEProblem<NumericalPolynomialSystem<u8>> {
        ODEProblem::new(matrix_example().to_numerical(), dvector![1.0, 1.0]).end_time(10.0)
    }
    fn matrix_symb_coeff_example() -> PolynomialSystem<QualifiedName, Parameter<QualifiedName>, u8>
    {
        let interaction_coeffs = dmatrix!["a11", "a12";
                                          "a21", "a22"]
        .map(|v| [(1.0, Monomial::generator(QualifiedName::from([v])))].into_iter().collect());
        let growth_rates = dvector!["r1", "r2"]
            .map(|v| [(1.0, Monomial::generator(QualifiedName::from([v])))].into_iter().collect());
        lotka_volterra_system(
            &vec!["x", "y"].into_iter().map(|v| QualifiedName::from([v])).collect_vec(),
            interaction_coeffs,
            growth_rates,
        )
    }
    fn matrix_example() -> PolynomialSystem<QualifiedName, f32, u8> {
        let coeffs: HashMap<_, _> = [("a12", -1.0), ("a21", 1.0), ("r1", 2.0), ("r2", -1.0)]
            .into_iter()
            .map(|(n, v)| (QualifiedName::from([n]), v))
            .collect();
        matrix_symb_coeff_example()
            .extend_scalars(|coeff| coeff.eval(|v| coeffs.get(v).copied().unwrap_or_default()))
            .map(|p| p.normalize())
    }

    #[test]
    fn matrix_agrees_with_theory() {
        assert_eq!(predator_prey_from_theory(), predator_prey_from_matrix());
    }

    #[test]
    fn lv_solve() {
        let problem = predator_prey_from_matrix();
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

    #[test]
    fn latex_symbolic() {
        let expected = expect![[r#"
            $$
            \begin{align*}
            \frac{\mathrm{d}}{\mathrm{d}t} x &= (r_{1}) x + (a_{12}) x y + (a_{11}) x^2\\
            \frac{\mathrm{d}}{\mathrm{d}t} y &= (a_{21}) x y + (r_{2}) y + (a_{22}) y^2
            \end{align*}
            $$
            "#]];
        expected.assert_eq(
            &matrix_symb_coeff_example()
                .extend_scalars(|p| {
                    p.map_variables(|n| {
                        let s = n.to_string();
                        let (a, b) = s.split_at(1);
                        QualifiedName::from(format!("{}_{{{}}}", a, b).as_ref())
                    })
                })
                .to_latex_string(),
        );
    }

    #[test]
    fn latex_numerical() {
        let expected = expect![[r#"
            $$
            \begin{align*}
            \frac{\mathrm{d}}{\mathrm{d}t} x &= 2 x + -x y\\
            \frac{\mathrm{d}}{\mathrm{d}t} y &= x y + -y
            \end{align*}
            $$
            "#]];
        expected.assert_eq(&matrix_example().to_latex_string());
    }
}
