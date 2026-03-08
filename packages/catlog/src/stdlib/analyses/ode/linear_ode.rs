//! Constant-coefficient linear first-order ODE analysis of models.
//!
//! The main entry point for this module is
//! [`linear_ode_analysis`](SignedCoefficientBuilder::linear_ode_analysis).

use std::collections::HashMap;
use std::hash::Hash;
use std::ops::Add;

use itertools::Itertools;
use nalgebra::{DMatrix, DVector};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::{ODEAnalysis, SignedCoefficientBuilder};
use crate::dbl::model::DiscreteDblModel;
use crate::simulate::ode::{NumericalPolynomialSystem, ODEProblem, PolynomialSystem};
use crate::{
    one::QualifiedPath,
    zero::{QualifiedName, rig::Monomial},
};

/// Data defining a linear ODE problem for a model.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct LinearODEProblemData {
    /// Map from morphism IDs to interaction coefficients (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "coefficients"))]
    coefficients: HashMap<QualifiedName, f32>,

    /// Map from object IDs to initial values (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "initialValues"))]
    initial_values: HashMap<QualifiedName, f32>,

    /// Duration of simulation.
    duration: f32,
}

/// Construct a linear (first-order) dynamical system;
/// a semantics for causal loop diagrams.
pub fn linear_polynomial_system<Var, Coef>(
    vars: &[Var],
    coefficients: DMatrix<Coef>,
) -> PolynomialSystem<Var, Coef, u8>
where
    Var: Clone + Hash + Ord,
    Coef: Clone + Add<Output = Coef>,
{
    PolynomialSystem {
        components: coefficients
            .row_iter()
            .zip(vars)
            .map(|(row, i)| {
                (
                    i.clone(),
                    row.iter()
                        .zip(vars)
                        .map(|(a, j)| (a.clone(), Monomial::generator(j.clone())))
                        .collect(),
                )
            })
            .collect(),
    }
}

impl SignedCoefficientBuilder<QualifiedName, QualifiedPath> {
    /// Linear ODE analysis for a model of a double theory.
    ///
    /// This analysis is a special case of linear ODE analysis for *extended* causal
    /// loop diagrams but can serve as a simple/naive semantics for causal loop
    /// diagrams, hopefully useful for toy models and demonstration purposes.
    pub fn linear_ode_analysis(
        &self,
        model: &DiscreteDblModel,
        data: LinearODEProblemData,
    ) -> ODEAnalysis<NumericalPolynomialSystem<u8>> {
        let (matrix, ob_index) = self.build_matrix(model);
        let n = ob_index.len();

        let initial_values = ob_index
            .keys()
            .map(|ob| data.initial_values.get(ob).copied().unwrap_or_default());
        let x0 = DVector::from_iterator(n, initial_values);

        let system = linear_polynomial_system(&ob_index.clone().into_keys().collect_vec(), matrix)
            .extend_scalars(|poly| {
                poly.eval(|mor| data.coefficients.get(mor).copied().unwrap_or_default())
            })
            .map(|p| p.normalize())
            .to_numerical();
        let problem = ODEProblem::new(system, x0).end_time(data.duration);
        ODEAnalysis::new(problem, ob_index)
    }
}

#[cfg(test)]
#[allow(non_snake_case)]
mod test {
    use expect_test::expect;
    use std::rc::Rc;

    use super::*;
    use crate::dbl::model::MutDblModel;
    use crate::simulate::ode::textplot_ode_result;
    use crate::stdlib;
    use crate::stdlib::analyses::ode::Parameter;
    use crate::{one::Path, zero::name};
    use nalgebra::{dmatrix, dvector};

    fn neg_loops_pos_connector_from_theory() -> ODEProblem<NumericalPolynomialSystem<u8>> {
        let th = Rc::new(stdlib::theories::th_signed_category());

        let mut test_model = DiscreteDblModel::new(th);
        test_model.add_ob(name("A"), name("Object"));
        test_model.add_ob(name("B"), name("Object"));
        test_model.add_ob(name("X"), name("Object"));
        let (aa, ax, bx, xb) = (name("aa"), name("ax"), name("bx"), name("xb"));
        test_model.add_mor(aa.clone(), name("A"), name("A"), name("Negative").into());
        test_model.add_mor(ax.clone(), name("A"), name("X"), Path::Id(name("Object")));
        test_model.add_mor(bx.clone(), name("B"), name("X"), name("Negative").into());
        test_model.add_mor(xb.clone(), name("X"), name("B"), Path::Id(name("Object")));

        let data = LinearODEProblemData {
            coefficients: [(aa, 0.3), (ax, 1.0), (bx, 2.0), (xb, 0.5)].into_iter().collect(),
            initial_values: [(name("A"), 2.0), (name("B"), 1.0), (name("X"), 1.0)]
                .into_iter()
                .collect(),
            duration: 10.0,
        };
        SignedCoefficientBuilder::new(name("Object"))
            .add_positive(Path::Id(name("Object")))
            .add_negative(Path::single(name("Negative")))
            .linear_ode_analysis(&test_model, data)
            .problem
    }

    fn neg_loops_pos_connector_from_matrix() -> ODEProblem<NumericalPolynomialSystem<u8>> {
        ODEProblem::new(matrix_example().to_numerical(), dvector![2.0, 1.0, 1.0]).end_time(10.0)
    }
    fn matrix_symb_coeff_example() -> PolynomialSystem<QualifiedName, Parameter<QualifiedName>, u8>
    {
        let A = dmatrix!["aa", "ba", "xa";
                         "ab", "bb", "xb";
                         "ax", "bx", "xx"]
        .map(|v| [(1.0, Monomial::generator(QualifiedName::from([v])))].into_iter().collect());
        linear_polynomial_system(
            &vec!["A", "B", "X"].into_iter().map(|v| QualifiedName::from([v])).collect_vec(),
            A,
        )
    }
    fn matrix_example() -> PolynomialSystem<QualifiedName, f32, u8> {
        let coeffs: HashMap<_, _> = [("aa", -0.3), ("ax", 1.0), ("bx", -2.0), ("xb", 0.5)]
            .into_iter()
            .map(|(n, v)| (QualifiedName::from([n]), v))
            .collect();
        matrix_symb_coeff_example()
            .extend_scalars(|coeff| coeff.eval(|v| coeffs.get(v).copied().unwrap_or_default()))
            .map(|p| p.normalize())
    }

    #[test]
    fn matrix_agrees_with_theory() {
        assert_eq!(neg_loops_pos_connector_from_theory(), neg_loops_pos_connector_from_matrix());
    }

    #[test]
    fn linear_solve() {
        let problem = neg_loops_pos_connector_from_matrix();
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

    #[test]
    fn latex_symbolic() {
        let expected = expect![[r#"
            $$
            \begin{align*}
            \frac{\mathrm{d}}{\mathrm{d}t} A &= aa A + ba B + xa X\\
            \frac{\mathrm{d}}{\mathrm{d}t} B &= ab A + bb B + xb X\\
            \frac{\mathrm{d}}{\mathrm{d}t} X &= ax A + bx B + xx X
            \end{align*}
            $$
            "#]];
        expected.assert_eq(&matrix_symb_coeff_example().to_latex_string());
    }

    #[test]
    fn latex_numerical() {
        let expected = expect![[r#"
            $$
            \begin{align*}
            \frac{\mathrm{d}}{\mathrm{d}t} A &= (-0.3) A\\
            \frac{\mathrm{d}}{\mathrm{d}t} B &= 0.5 X\\
            \frac{\mathrm{d}}{\mathrm{d}t} X &= A + (-2) B
            \end{align*}
            $$
            "#]];
        expected.assert_eq(&matrix_example().to_latex_string());
    }
}
