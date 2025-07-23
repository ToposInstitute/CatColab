/*! Constant-coefficient linear first-order ODE analysis of models.

The main entry point for this module is
[`linear_ode_analysis`](SignedCoefficientBuilder::linear_ode_analysis).
 */

use std::{collections::HashMap, hash::Hash};

use nalgebra::DVector;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::{ODEAnalysis, SignedCoefficientBuilder};
use crate::dbl::model::FgDblModel;
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

impl<ObType, MorType> SignedCoefficientBuilder<ObType, MorType> {
    /** Linear ODE analysis for a model of a double theory.

    This analysis is a special case of linear ODE analysis for *extended* causal
    loop diagrams but can serve as a simple/naive semantics for causal loop
    diagrams, hopefully useful for toy models and demonstration purposes.
     */
    pub fn linear_ode_analysis<Id>(
        &self,
        model: &impl FgDblModel<ObType = ObType, MorType = MorType, Ob = Id, ObGen = Id, MorGen = Id>,
        data: LinearODEProblemData<Id>,
    ) -> ODEAnalysis<Id, LinearODESystem>
    where
        Id: Eq + Clone + Hash + Ord,
    {
        let (matrix, ob_index) = self.build_matrix(model, &data.coefficients);
        let n = ob_index.len();

        let initial_values = ob_index
            .keys()
            .map(|ob| data.initial_values.get(ob).copied().unwrap_or_default());
        let x0 = DVector::from_iterator(n, initial_values);

        let system = LinearODESystem::new(matrix);
        let problem = ODEProblem::new(system, x0).end_time(data.duration);
        ODEAnalysis::new(problem, ob_index)
    }
}

#[cfg(test)]
mod test {
    use std::rc::Rc;
    use ustr::ustr;

    use super::*;
    use crate::dbl::model::{MutDblModel, UstrDiscreteDblModel};
    use crate::one::Path;
    use crate::{simulate::ode::linear_ode, stdlib};

    #[test]
    fn neg_loops_pos_connector() {
        let th = Rc::new(stdlib::theories::th_signed_category());

        let (a, b, x) = (ustr("A"), ustr("B"), ustr("X"));
        let (aa, ax, bx, xb) = (ustr("aa"), ustr("ax"), ustr("bx"), ustr("xb"));
        let mut test_model = UstrDiscreteDblModel::new(th);
        test_model.add_ob(a, ustr("Object"));
        test_model.add_ob(b, ustr("Object"));
        test_model.add_ob(x, ustr("Object"));
        test_model.add_mor(aa, a, a, ustr("Negative").into());
        test_model.add_mor(ax, a, x, Path::Id(ustr("Object")));
        test_model.add_mor(bx, b, x, ustr("Negative").into());
        test_model.add_mor(xb, x, b, Path::Id(ustr("Object")));

        let data = LinearODEProblemData {
            coefficients: [(aa, 0.3), (ax, 1.0), (bx, 2.0), (xb, 0.5)].into_iter().collect(),
            initial_values: [(a, 2.0), (b, 1.0), (x, 1.0)].into_iter().collect(),
            duration: 10.0,
        };
        let analysis = SignedCoefficientBuilder::new(ustr("Object"))
            .add_positive(Path::Id(ustr("Object")))
            .add_negative(Path::single(ustr("Negative")))
            .linear_ode_analysis(&test_model, data);
        assert_eq!(analysis.problem, linear_ode::create_neg_loops_pos_connector());
    }
}
