//! Lotka-Volterra ODE analysis of models.

use std::{collections::HashMap, hash::Hash};

use nalgebra::{DMatrix, DVector};
use ode_solvers::dop_shared::IntegrationError;
use ustr::Ustr;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify_next::Tsify;

use super::ODESolution;
use crate::{
    dbl::model::{DiscreteDblModel, FgDblModel},
    one::fin_category::{FinMor, UstrFinCategory},
    one::FgCategory,
    simulate::ode::{LotkaVolterraSystem, ODEProblem},
};

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

type Model<Id> = DiscreteDblModel<Id, UstrFinCategory>;

/** Lotka-Volterra ODE analysis for models of a double theory.

The main situation we have in mind is the Lotka-Volterra ODE semantics for
regulatory networks (signed graphs) described in our [*Compositionality*
paper](crate::refs::RegNets).
*/
pub struct LotkaVolterraAnalysis {
    var_ob_type: Ustr,
    positive_mor_types: Vec<FinMor<Ustr, Ustr>>,
    negative_mor_types: Vec<FinMor<Ustr, Ustr>>,
}

impl LotkaVolterraAnalysis {
    /// Creates a new Lotka-Volterra analysis for the given object type.
    pub fn new(var_ob_type: Ustr) -> Self {
        Self {
            var_ob_type,
            positive_mor_types: Vec::new(),
            negative_mor_types: Vec::new(),
        }
    }

    /// Adds a morphism type defining a positive interaction between objects.
    pub fn add_positive(mut self, mor_type: FinMor<Ustr, Ustr>) -> Self {
        self.positive_mor_types.push(mor_type);
        self
    }

    /// Adds a morphism type defining a negative interaction between objects.
    pub fn add_negative(mut self, mor_type: FinMor<Ustr, Ustr>) -> Self {
        self.negative_mor_types.push(mor_type);
        self
    }

    /** Creates a Lotka-Volterra system from a model.

    Returns an ODE problem together with a mapping from object IDs to indices of
    variables in the ODE.
    */
    pub fn create_system<Id>(
        &self,
        model: &Model<Id>,
        data: LotkaVolterraProblemData<Id>,
    ) -> (ODEProblem<LotkaVolterraSystem>, HashMap<Id, usize>)
    where
        Id: Eq + Clone + Hash + Ord,
    {
        let mut objects: Vec<_> = model.object_generators_with_type(&self.var_ob_type).collect();
        objects.sort();
        let ob_index: HashMap<_, _> =
            objects.iter().enumerate().map(|(i, x)| (x.clone(), i)).collect();

        let n = objects.len();

        let mut A = DMatrix::from_element(n, n, 0.0f32);
        for mor_type in self.positive_mor_types.iter() {
            for mor in model.morphism_generators_with_type(mor_type) {
                let i = *ob_index.get(&model.morphism_generator_dom(&mor)).unwrap();
                let j = *ob_index.get(&model.morphism_generator_cod(&mor)).unwrap();
                A[(j, i)] += data.interaction_coeffs.get(&mor).copied().unwrap_or_default();
            }
        }
        for mor_type in self.negative_mor_types.iter() {
            for mor in model.morphism_generators_with_type(mor_type) {
                let i = *ob_index.get(&model.morphism_generator_dom(&mor)).unwrap();
                let j = *ob_index.get(&model.morphism_generator_cod(&mor)).unwrap();
                A[(j, i)] -= data.interaction_coeffs.get(&mor).copied().unwrap_or_default();
            }
        }

        let growth_rates =
            objects.iter().map(|ob| data.growth_rates.get(ob).copied().unwrap_or_default());
        let b = DVector::from_iterator(n, growth_rates);

        let initial_values = objects
            .iter()
            .map(|ob| data.initial_values.get(ob).copied().unwrap_or_default());
        let x0 = DVector::from_iterator(n, initial_values);

        let system = LotkaVolterraSystem::new(A, b);
        let problem = ODEProblem::new(system, x0).end_time(data.duration);
        (problem, ob_index)
    }

    /// Solves the Lotka-Volterra ODE system created from a model.
    pub fn solve<Id>(
        &self,
        model: &Model<Id>,
        data: LotkaVolterraProblemData<Id>,
    ) -> Result<ODESolution<Id>, IntegrationError>
    where
        Id: Eq + Clone + Hash + Ord,
    {
        let output_step_size = (data.duration / 100.0).min(0.01f32);
        let (problem, ob_index) = self.create_system(model, data);
        if ob_index.is_empty() {
            return Ok(Default::default());
        }

        let result = problem.solve_dopri5(output_step_size)?;
        let (t_out, x_out) = result.get();
        Ok(ODESolution {
            time: t_out.clone(),
            states: ob_index
                .into_iter()
                .map(|(ob, i)| (ob, x_out.iter().map(|x| x[i]).collect()))
                .collect(),
        })
    }
}

#[cfg(test)]
mod test {
    use std::sync::Arc;
    use ustr::ustr;

    use super::*;
    use crate::{simulate::ode::lotka_volterra, stdlib};

    #[test]
    fn predator_prey() {
        let th = Arc::new(stdlib::theories::th_signed_category());
        let neg_feedback = stdlib::models::negative_feedback(th);

        let (prey, pred) = (ustr("x"), ustr("y"));
        let (pos, neg) = (ustr("positive"), ustr("negative"));
        let data = LotkaVolterraProblemData {
            interaction_coeffs: [(pos, 1.0), (neg, 1.0)].into_iter().collect(),
            growth_rates: [(prey, 2.0), (pred, -1.0)].into_iter().collect(),
            initial_values: [(prey, 1.0), (pred, 1.0)].into_iter().collect(),
            duration: 10.0,
        };
        let (problem, _) = LotkaVolterraAnalysis::new(ustr("Object"))
            .add_positive(FinMor::Id(ustr("Object")))
            .add_negative(FinMor::Generator(ustr("Negative")))
            .create_system(&neg_feedback, data);
        assert_eq!(problem, lotka_volterra::create_predator_prey());
    }
}
