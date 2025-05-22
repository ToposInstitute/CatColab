//! Constant-coefficient linear first-order ODE analysis of models.

use std::{collections::HashMap, hash::Hash};

use nalgebra::{DMatrix, DVector};
use ustr::Ustr;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::ODEAnalysis;
use crate::dbl::model::{DiscreteDblModel, FgDblModel};
use crate::one::fp_category::UstrFpCategory;
use crate::one::{FgCategory, Path};
use crate::simulate::ode::{CCLFOSystem, ODEProblem};

/// Data defining a CCLFO ODE problem for a model.
#[derive(Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct CCLFOProblemData<Id>
where
    Id: Eq + Hash,
{
    /// Map from morphism IDs to interaction coefficients (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "interactionCoefficients"))]
    interaction_coeffs: HashMap<Id, f32>,

    /// Map from object IDs to initial values (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "initialValues"))]
    initial_values: HashMap<Id, f32>,

    /// Duration of simulation.
    duration: f32,
}

type Model<Id> = DiscreteDblModel<Id, UstrFpCategory>;

/** CCLFO ODE analysis for models of a double theory.

The main situation we have in mind is ...
*/
pub struct CCLFOAnalysis {
    var_ob_type: Ustr,
    positive_mor_types: Vec<Path<Ustr, Ustr>>,
    negative_mor_types: Vec<Path<Ustr, Ustr>>,
}

impl CCLFOAnalysis {
    /// Creates a new CCLFO analysis for the given object type.
    pub fn new(var_ob_type: Ustr) -> Self {
        Self {
            var_ob_type,
            positive_mor_types: Vec::new(),
            negative_mor_types: Vec::new(),
        }
    }

    /// Adds a morphism type defining a positive interaction between objects.
    pub fn add_positive(mut self, mor_type: Path<Ustr, Ustr>) -> Self {
        self.positive_mor_types.push(mor_type);
        self
    }

    /// Adds a morphism type defining a negative interaction between objects.
    pub fn add_negative(mut self, mor_type: Path<Ustr, Ustr>) -> Self {
        self.negative_mor_types.push(mor_type);
        self
    }

    /// Creates a CCLFO system from a model.
    pub fn create_system<Id>(
        &self,
        model: &Model<Id>,
        data: CCLFOProblemData<Id>,
    ) -> ODEAnalysis<Id, CCLFOSystem>
    where
        Id: Eq + Clone + Hash + Ord,
    {
        let mut objects: Vec<_> = model.ob_generators_with_type(&self.var_ob_type).collect();
        objects.sort();
        let ob_index: HashMap<_, _> =
            objects.iter().cloned().enumerate().map(|(i, x)| (x, i)).collect();

        let n = objects.len();

        let mut A = DMatrix::from_element(n, n, 0.0f32);
        for mor_type in self.positive_mor_types.iter() {
            for mor in model.mor_generators_with_type(mor_type) {
                let i = *ob_index.get(&model.mor_generator_dom(&mor)).unwrap();
                let j = *ob_index.get(&model.mor_generator_cod(&mor)).unwrap();
                A[(j, i)] += data.interaction_coeffs.get(&mor).copied().unwrap_or_default();
            }
        }
        for mor_type in self.negative_mor_types.iter() {
            for mor in model.mor_generators_with_type(mor_type) {
                let i = *ob_index.get(&model.mor_generator_dom(&mor)).unwrap();
                let j = *ob_index.get(&model.mor_generator_cod(&mor)).unwrap();
                A[(j, i)] -= data.interaction_coeffs.get(&mor).copied().unwrap_or_default();
            }
        }

        let initial_values = objects
            .iter()
            .map(|ob| data.initial_values.get(ob).copied().unwrap_or_default());
        let x0 = DVector::from_iterator(n, initial_values);

        let system = CCLFOSystem::new(A);
        let problem = ODEProblem::new(system, x0).end_time(data.duration);
        ODEAnalysis::new(problem, ob_index)
    }
}

// #[cfg(test)]
// mod test {
//     use std::rc::Rc;
//     use ustr::ustr;

//     use super::*;
//     use crate::{simulate::ode::lotka_volterra, stdlib};

//     #[test]
//     fn predator_prey() {
//         let th = Rc::new(stdlib::theories::th_signed_category());
//         let neg_feedback = stdlib::models::negative_feedback(th);

//         let (prey, pred) = (ustr("x"), ustr("y"));
//         let (pos, neg) = (ustr("positive"), ustr("negative"));
//         let data = CCLFOProblemData {
//             interaction_coeffs: [(pos, 1.0), (neg, 1.0)].into_iter().collect(),
//             growth_rates: [(prey, 2.0), (pred, -1.0)].into_iter().collect(),
//             initial_values: [(prey, 1.0), (pred, 1.0)].into_iter().collect(),
//             duration: 10.0,
//         };
//         let analysis = CCLFOAnalysis::new(ustr("Object"))
//             .add_positive(Path::Id(ustr("Object")))
//             .add_negative(Path::single(ustr("Negative")))
//             .create_system(&neg_feedback, data);
//         assert_eq!(analysis.problem, lotka_volterra::create_predator_prey());
//     }
// }
