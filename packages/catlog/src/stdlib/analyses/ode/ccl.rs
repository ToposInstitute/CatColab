//! Constant-coefficient linear ODE analysis of models.

use std::{collections::HashMap, hash::Hash};

use nalgebra::{DMatrix, DVector};
use ustr::Ustr;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify_next::Tsify;

use super::ODEAnalysis;
use crate::dbl::model::{DiscreteDblModel, FgDblModel};
use crate::one::fp_category::UstrFpCategory;
use crate::one::{FgCategory, Path};
use crate::simulate::ode::{CCLSystem, ODEProblem};

/// Data defining a CCL ODE problem for a model.
#[derive(Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct CCLProblemData<Id>
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

/** CCL ODE analysis for models of a double theory.

The main situation we have in mind is ... TO-DO
*/
pub struct CCLAnalysis {
    var_ob_type: Ustr,
    positive_mor_types: Vec<Path<Ustr, Ustr>>,
    negative_mor_types: Vec<Path<Ustr, Ustr>>,
}

impl CCLAnalysis {
    /// Creates a new CCL analysis for the given object type.
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

    /// Creates a CCL system from a model.
    pub fn create_system<Id>(
        &self,
        model: &Model<Id>,
        in_zeros: &HashMap<Id, Vec<(Id, Id)>>,
        degree_zeros_with_depth: HashMap<Id, usize>,
        data: CCLProblemData<Id>,
    ) -> ODEAnalysis<Id, CCLSystem>
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
                A[(j, i)] += data.interaction_coeffs.get(&mor).copied().unwrap_or(1.0);
            }
        }
        for mor_type in self.negative_mor_types.iter() {
            for mor in model.mor_generators_with_type(mor_type) {
                let i = *ob_index.get(&model.mor_generator_dom(&mor)).unwrap();
                let j = *ob_index.get(&model.mor_generator_cod(&mor)).unwrap();
                A[(j, i)] -= data.interaction_coeffs.get(&mor).copied().unwrap_or(1.0);
            }
        }

        // TO-DO: "better" would be to have Vec<(Vec<&Id>)> where we just stick
        // all the morphisms of the same depth into a sub-list
        let mut sorted_degree_zeros: Vec<(&Id, &usize)> = degree_zeros_with_depth.iter().collect();
        // TO-DO: why can I not combine these???? .iter().collect::<Vec<(&Id, &usize)>>()
        sorted_degree_zeros.sort_by(|a, b| a.1.cmp(b.1));

        for (cod, _) in sorted_degree_zeros {
            for (mor, dom) in in_zeros.get(&cod).expect("unwrap") {
                let mut B = DMatrix::from_element(n, n, 0.0f32);
                B.fill_with_identity();
                let i = *ob_index.get(dom).expect("expect");
                let j = *ob_index.get(cod).expect("evan");
                // TO-DO: we should care whether or not these are pos/neg
                B[(j, i)] += data.interaction_coeffs.get(&mor).copied().unwrap_or(1.0);
                A = B * A;
            }
        }

        let initial_values =
            objects.iter().map(|ob| data.initial_values.get(ob).copied().unwrap_or(1.0));
        let x0 = DVector::from_iterator(n, initial_values);

        let system = CCLSystem::new(A);
        let problem = ODEProblem::new(system, x0).end_time(data.duration);
        ODEAnalysis::new(problem, ob_index)
    }
}
