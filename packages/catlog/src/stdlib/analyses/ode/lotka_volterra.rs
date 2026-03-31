//! Lotka-Volterra ODE analysis of models.
//!
//! The main entry point for this module is
//! [`lotka_volterra_analysis`](SignedCoefficientBuilder::lotka_volterra_analysis).

use std::collections::HashMap;
use std::hash::Hash;
use std::ops::Add;

use indexmap::IndexMap;
use itertools::Itertools;
use nalgebra::{DMatrix, DVector, Scalar};
use num_traits::{One, Zero};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::{ODEAnalysis, Parameter, SignedCoefficientBuilder};
use crate::simulate::ode::{NumericalPolynomialSystem, ODEProblem, PolynomialSystem};
use crate::{
    dbl::model::DiscreteDblModel,
    one::QualifiedPath,
    zero::{QualifiedName, alg::Polynomial, rig::Monomial},
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
    Coef: Clone + Add<Output = Coef> + One + Scalar + Zero,
{
    let system = PolynomialSystem {
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
    };
    system.normalize()
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
        let (system, ob_index) = self.lotka_volterra_system(model);
        let n = ob_index.len();

        let initial_values = ob_index
            .keys()
            .map(|ob| data.initial_values.get(ob).copied().unwrap_or_default());
        let x0 = DVector::from_iterator(n, initial_values);

        let system = system
            .extend_scalars(|poly| {
                poly.eval(|id| {
                    data.interaction_coeffs
                        .get(id)
                        .or(data.growth_rates.get(id))
                        .copied()
                        .unwrap_or_default()
                })
            })
            .to_numerical();
        let problem = ODEProblem::new(system, x0).end_time(data.duration);
        ODEAnalysis::new(problem, ob_index)
    }

    /// Lotka-Volterra ODE system for an model of a double theory.
    pub fn lotka_volterra_system(
        &self,
        model: &DiscreteDblModel,
    ) -> (
        PolynomialSystem<QualifiedName, Parameter<QualifiedName>, u8>,
        IndexMap<QualifiedName, usize>,
    ) {
        let (matrix, ob_index) = self.build_matrix(model);
        let n = ob_index.len();

        let growth_rate_params = ob_index
            .keys()
            .map(|ob| [(1.0, Monomial::generator(ob.clone()))].into_iter().collect());
        let b = DVector::from_iterator(n, growth_rate_params);

        let system = lotka_volterra_system(&ob_index.keys().cloned().collect_vec(), matrix, b);
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
    fn predatory_prey_symbolic() {
        let th = Rc::new(stdlib::theories::th_signed_category());
        let neg_feedback = stdlib::models::negative_feedback(th);
        let (sys, _) = builder().lotka_volterra_system(&neg_feedback);
        let sys = sys.extend_scalars(|coef| coef.map_variables(|name| format!("Param({name})")));
        let expected = expect!([r#"
            dx = (Param(x)) x + (-Param(negative)) x y
            dy = (Param(positive)) x y + (Param(y)) y
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn predator_prey_numerical() {
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

        let sys = builder().lotka_volterra_analysis(&neg_feedback, data).problem.system;
        let expected = expect!([r#"
            dx0 = 2 x0 + -x0 x1
            dx1 = x0 x1 + -x1
        "#]);
        expected.assert_eq(&sys.to_string());
    }
}
