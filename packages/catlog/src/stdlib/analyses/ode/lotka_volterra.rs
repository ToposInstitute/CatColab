//! Lotka-Volterra ODE analysis of models.
//!
//! The main entry point for this module is
//! [`lotka_volterra_analysis`](SignedCoefficientBuilder::lotka_volterra_analysis).

use std::collections::HashMap;

use nalgebra::DVector;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::{ODEAnalysis, SignedCoefficientBuilder};
use crate::dbl::model::DiscreteDblModel;
use crate::simulate::ode::{LotkaVolterraSystem, ODEProblem};
use crate::{one::QualifiedPath, zero::QualifiedName};

/// Data defining a Lotka-Volterra ODE problem for a model.
#[derive(Clone)]
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
    ) -> ODEAnalysis<LotkaVolterraSystem> {
        let (matrix, ob_index) = self.build_matrix(model, &data.interaction_coeffs);
        let n = ob_index.len();

        let growth_rates =
            ob_index.keys().map(|ob| data.growth_rates.get(ob).copied().unwrap_or_default());
        let b = DVector::from_iterator(n, growth_rates);

        let initial_values = ob_index
            .keys()
            .map(|ob| data.initial_values.get(ob).copied().unwrap_or_default());
        let x0 = DVector::from_iterator(n, initial_values);

        let system = LotkaVolterraSystem::new(matrix, b);
        let problem = ODEProblem::new(system, x0).end_time(data.duration);
        ODEAnalysis::new(problem, ob_index)
    }
}

#[cfg(test)]
mod test {
    use std::rc::Rc;

    use super::*;
    use crate::{one::Path, zero::name};
    use crate::{simulate::ode::lotka_volterra, stdlib};

    #[test]
    fn predator_prey() {
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
        let analysis = SignedCoefficientBuilder::new(name("Object"))
            .add_positive(Path::Id(name("Object")))
            .add_negative(Path::single(name("Negative")))
            .lotka_volterra_analysis(&neg_feedback, data);
        assert_eq!(analysis.problem, lotka_volterra::create_predator_prey());
    }
}
