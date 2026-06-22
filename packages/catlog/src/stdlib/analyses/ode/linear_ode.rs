//! Constant-coefficient linear first-order ODE analysis of models.
//!
//! The main entry point for this module is
//! [`linear_ode_analysis`](SignedCoefficientBuilder::linear_ode_analysis).

use std::collections::HashMap;
use std::hash::Hash;
use std::ops::Add;

use indexmap::IndexMap;
use itertools::Itertools;
use nalgebra::{DMatrix, DVector};
use num_traits::Zero;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::{ODEAnalysis, Parameter, SignedCoefficientBuilder};
use crate::simulate::ode::{NumericalPolynomialSystem, ODEProblem, PolynomialSystem};
use crate::{
    dbl::model::DiscreteDblModel,
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
    Coef: Clone + Add<Output = Coef> + Zero,
{
    let system = PolynomialSystem {
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
    };
    system.normalize()
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
        let (system, ob_index) = self.linear_ode_system(model);
        let n = ob_index.len();

        let initial_values = ob_index
            .keys()
            .map(|ob| data.initial_values.get(ob).copied().unwrap_or_default());
        let x0 = DVector::from_iterator(n, initial_values);

        let system = system
            .extend_scalars(|poly| {
                poly.eval(|id| data.coefficients.get(id).copied().unwrap_or_default())
            })
            .to_numerical();
        let problem = ODEProblem::new(system, x0).end_time(data.duration);
        ODEAnalysis::new(problem, ob_index)
    }

    /// Linear ODE system for a model of a double theory.
    pub fn linear_ode_system(
        &self,
        model: &DiscreteDblModel,
    ) -> (
        PolynomialSystem<QualifiedName, Parameter<QualifiedName>, u8>,
        IndexMap<QualifiedName, usize>,
    ) {
        let (matrix, ob_index) = self.build_matrix(model);
        let system = linear_polynomial_system(&ob_index.keys().cloned().collect_vec(), matrix);
        (system, ob_index)
    }
}

#[cfg(test)]
mod test {
    use expect_test::expect;
    use std::rc::Rc;

    use super::*;
    use crate::stdlib;
    use crate::{one::Path, zero::name};

    fn builder() -> SignedCoefficientBuilder<QualifiedName, QualifiedPath> {
        SignedCoefficientBuilder::new(name("Object"))
            .add_positive(Path::Id(name("Object")))
            .add_negative(Path::single(name("Negative")))
    }

    #[test]
    fn negative_feedback_symbolic() {
        let th = Rc::new(stdlib::theories::th_signed_category());
        let neg_feedback = stdlib::models::negative_feedback(th);
        let (sys, _) = builder().linear_ode_system(&neg_feedback);
        let expected = expect![[r#"
            dx = -negative y
            dy = positive x
        "#]];
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn negative_feedback_numerical() {
        let th = Rc::new(stdlib::theories::th_signed_category());
        let neg_feedback = stdlib::models::negative_feedback(th);

        let data = LinearODEProblemData {
            coefficients: [(name("positive"), 2.0), (name("negative"), 1.0)].into_iter().collect(),
            initial_values: [(name("x"), 1.0), (name("y"), 1.0)].into_iter().collect(),
            duration: 10.0,
        };

        let sys = builder().linear_ode_analysis(&neg_feedback, data).problem.system;
        let expected = expect![[r#"
            dx0 = -x1
            dx1 = 2 x0
        "#]];
        expected.assert_eq(&sys.to_string());
    }
}
