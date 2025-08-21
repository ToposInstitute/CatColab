/*! Lotka-Volterra ODE analysis of models.

The main entry point for this module is
[`lotka_volterra_analysis`](SignedCoefficientBuilder::lotka_volterra_analysis).
 */

use std::{collections::HashMap, hash::Hash};

use nalgebra::DVector;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::{ODEAnalysis, SignedCoefficientBuilder};
use crate::dbl::model::FgDblModel;
use crate::simulate::ode::{LotkaVolterraSystem, ODEProblem};

/// Data defining a Lotka-Volterra ODE problem for a model.
#[derive(Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct LotkaVolterraProblemData<Id>
where
    Id: Eq + Hash,
{
    /// Map from morphism IDs to interaction coefficients (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "interactionCoefficients"))]
    interaction_coeffs: HashMap<Id, f32>,

    /// Map from object IDs to growth rates (arbitrary real numbers).
    #[cfg_attr(feature = "serde", serde(rename = "growthRates"))]
    growth_rates: HashMap<Id, f32>,

    /// Map from object IDs to initial values (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "initialValues"))]
    initial_values: HashMap<Id, f32>,

    /// Duration of simulation.
    duration: f32,
}

impl<ObType, MorType> SignedCoefficientBuilder<ObType, MorType> {
    /** Lotka-Volterra ODE analysis for a model of a double theory.

    The main application we have in mind is the Lotka-Volterra ODE semantics for
    signed graphs described in our [paper on regulatory
    networks](crate::refs::RegNets).
     */
    pub fn lotka_volterra_analysis<Id>(
        &self,
        model: &impl FgDblModel<ObType = ObType, MorType = MorType, Ob = Id, ObGen = Id, MorGen = Id>,
        data: LotkaVolterraProblemData<Id>,
    ) -> ODEAnalysis<Id, LotkaVolterraSystem>
    where
        Id: Eq + Clone + Hash + Ord,
    {
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
    use ustr::ustr;

    use super::*;
    use crate::{one::Path, zero::name};
    use crate::{simulate::ode::lotka_volterra, stdlib};

    #[test]
    fn predator_prey() {
        let th = Rc::new(stdlib::theories::th_signed_category());
        let neg_feedback = stdlib::models::negative_feedback(th);

        let (prey, pred) = (ustr("x"), ustr("y"));
        let (pos, neg) = (ustr("positive"), ustr("negative"));
        let data = LotkaVolterraProblemData {
            interaction_coeffs: [(pos, 1.0), (neg, 1.0)].into_iter().collect(),
            growth_rates: [(prey, 2.0), (pred, -1.0)].into_iter().collect(),
            initial_values: [(prey, 1.0), (pred, 1.0)].into_iter().collect(),
            duration: 10.0,
        };
        let analysis = SignedCoefficientBuilder::new(name("Object"))
            .add_positive(Path::Id(name("Object")))
            .add_negative(Path::single(name("Negative")))
            .lotka_volterra_analysis(&neg_feedback, data);
        assert_eq!(analysis.problem, lotka_volterra::create_predator_prey());
    }
}
