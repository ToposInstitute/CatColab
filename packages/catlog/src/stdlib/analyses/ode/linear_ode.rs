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
use crate::simulate::ode::{LinearODESystem, ODEProblem};

/// Data defining a linear ODE problem for a model.
#[derive(Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct LinearODEProblemData<Id>
where
    Id: Eq + Hash,
{
    /// Map from morphism IDs to interaction coefficients (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "coefficients"))]
    coefficients: HashMap<Id, f32>,

    /// Map from object IDs to initial values (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "initialValues"))]
    initial_values: HashMap<Id, f32>,

    /// Duration of simulation.
    duration: f32,
}

type Model<Id> = DiscreteDblModel<Id, UstrFpCategory>;

/** Linear ODE analysis for models of a double theory.

This analysis is somewhat subordinate to the more general case of linear ODE
analysis for *extended* causal loop diagrams, but it can hopefully act as a
simple/naive semantics for causal loop diagrams that is useful for building
toy models for demonstration purposes.
*/
pub struct LinearODEAnalysis {
    var_ob_type: Ustr,
    positive_mor_types: Vec<Path<Ustr, Ustr>>,
    negative_mor_types: Vec<Path<Ustr, Ustr>>,
}

impl LinearODEAnalysis {
    /// Creates a new LinearODE analysis for the given object type.
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

    /// Creates a LinearODE system from a model.
    pub fn create_system<Id>(
        &self,
        model: &Model<Id>,
        data: LinearODEProblemData<Id>,
    ) -> ODEAnalysis<Id, LinearODESystem>
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
                A[(j, i)] += data.coefficients.get(&mor).copied().unwrap_or(1.0);
            }
        }
        for mor_type in self.negative_mor_types.iter() {
            for mor in model.mor_generators_with_type(mor_type) {
                let i = *ob_index.get(&model.mor_generator_dom(&mor)).unwrap();
                let j = *ob_index.get(&model.mor_generator_cod(&mor)).unwrap();
                A[(j, i)] -= data.coefficients.get(&mor).copied().unwrap_or(1.0);
            }
        }

        // // TO-DO: "better" would be to have Vec<(Vec<&Id>)> where we just stick
        // // all the morphisms of the same depth into a sub-list
        // let mut sorted_degree_zeros: Vec<(&Id, &usize)> = degree_zeros_with_depth.iter().collect();
        // // TO-DO: why can I not combine these???? .iter().collect::<Vec<(&Id, &usize)>>()
        // sorted_degree_zeros.sort_by(|a, b| a.1.cmp(b.1));

        // for (cod, _) in sorted_degree_zeros {
        //     for (mor, dom) in in_zeros.get(&cod).expect("unwrap") {
        //         let mut B = DMatrix::from_element(n, n, 0.0f32);
        //         B.fill_with_identity();
        //         let i = *ob_index.get(dom).expect("expect");
        //         let j = *ob_index.get(cod).expect("evan");
        //         // TO-DO: we should care whether or not these are pos/neg
        //         B[(j, i)] += data.coefficients.get(&mor).copied().unwrap_or(1.0);
        //         A = B * A;
        //     }
        // }

        let initial_values = objects
            .iter()
            .map(|ob| data.initial_values.get(ob).copied().unwrap_or_default());
        let x0 = DVector::from_iterator(n, initial_values);

        let system = LinearODESystem::new(A);
        let problem = ODEProblem::new(system, x0).end_time(data.duration);
        ODEAnalysis::new(problem, ob_index)
    }
}

#[cfg(test)]
mod test {
    use std::rc::Rc;
    use ustr::ustr;

    use super::*;
    use crate::{
        dbl::model::{MutDblModel, UstrDiscreteDblModel},
        simulate::ode::linear_ode,
        stdlib,
    };

    #[test]
    fn neg_loops_pos_connector() {
        let th = Rc::new(stdlib::theories::th_signed_category());

        let (A, B, X) = (ustr("A"), ustr("B"), ustr("X"));

        let mut test_model = UstrDiscreteDblModel::new(th);
        test_model.add_ob(A, ustr("Object"));
        test_model.add_ob(B, ustr("Object"));
        test_model.add_ob(X, ustr("Object"));
        test_model.add_mor(ustr("aa"), A, A, ustr("Negative").into());
        test_model.add_mor(ustr("ax"), A, X, Path::Id(ustr("Object")));
        test_model.add_mor(ustr("bx"), B, X, ustr("Negative").into());
        test_model.add_mor(ustr("xb"), X, B, Path::Id(ustr("Object")));

        let test_data = LinearODEProblemData {
            coefficients: [
                (ustr("aa"), 0.3),
                (ustr("ax"), 1.0),
                (ustr("bx"), 2.0),
                (ustr("xb"), 0.5),
            ]
            .into_iter()
            .collect(),
            initial_values: [(A, 2.0), (B, 1.0), (X, 1.0)].into_iter().collect(),
            duration: 10.0,
        };

        let test_analysis = LinearODEAnalysis::new(ustr("Object"))
            .add_positive(Path::Id(ustr("Object")))
            .add_negative(Path::single(ustr("Negative")))
            .create_system(&test_model, test_data);

        assert_eq!(test_analysis.problem, linear_ode::create_neg_loops_pos_connector());
    }
}
