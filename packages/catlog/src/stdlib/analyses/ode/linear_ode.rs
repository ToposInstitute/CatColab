/*! Constant-coefficient linear first-order ODE analysis of models.

The main entry point for this module is
[`linear_ode_analysis`](SignedCoefficientBuilder::linear_ode_analysis).
 */

use std::collections::HashMap;

use nalgebra::DVector;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::{ODEAnalysis, SignedCoefficientBuilder};
use crate::dbl::model::DiscreteDblModel;
use crate::simulate::ode::{LinearODESystem, ODEProblem};
use crate::{one::QualifiedPath, zero::QualifiedName};

/// Data defining a linear ODE problem for a model.
#[derive(Clone)]
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

impl SignedCoefficientBuilder<QualifiedName, QualifiedPath> {
    /** Linear ODE analysis for a model of a double theory.

    This analysis is a special case of linear ODE analysis for *extended* causal
    loop diagrams but can serve as a simple/naive semantics for causal loop
    diagrams, hopefully useful for toy models and demonstration purposes.
     */
    pub fn linear_ode_analysis(
        &self,
        model: &DiscreteDblModel,
        data: LinearODEProblemData,
    ) -> ODEAnalysis<LinearODESystem> {
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

    use super::*;
    use crate::dbl::model::MutDblModel;
    use crate::{one::Path, zero::name};
    use crate::{simulate::ode::linear_ode, stdlib};

    #[test]
    fn neg_loops_pos_connector() {
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
        let analysis = SignedCoefficientBuilder::new(name("Object"))
            .add_positive(Path::Id(name("Object")))
            .add_negative(Path::single(name("Negative")))
            .linear_ode_analysis(&test_model, data);
        assert_eq!(analysis.problem, linear_ode::create_neg_loops_pos_connector());
    }
}
