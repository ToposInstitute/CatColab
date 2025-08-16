/*! Kuramoto model (first-order) for coupled oscillators.

The main entry point for this module is
[`kuramoto_analysis`](SignedCoefficientBuilder::kuramoto_analysis).
 */

use std::{collections::HashMap, hash::Hash};

use nalgebra::DVector;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::{ODEAnalysis, SignedCoefficientBuilder};
use crate::dbl::model::FgDblModel;
use crate::simulate::ode::{KuramotoSystem, ODEProblem};

/// Data defining a linear ODE problem for a model.
#[derive(Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct KuramotoProblemData<Id>
where
    Id: Eq + Hash,
{
    /// Map from morphism IDs to coupling strength (non-negative reals).
    #[cfg_attr(feature = "serde", serde(rename = "couplingStrengths"))]
    coupling_strengths: HashMap<Id, f32>,

    /// Map from object IDs to natural frequencies (non-negative reals).
    #[cfg_attr(feature = "serde", serde(rename = "naturalFrequencies"))]
    natural_frequencies: HashMap<Id, f32>,

    /// Map from object IDs to initial phase values (non-negative reals).
    #[cfg_attr(feature = "serde", serde(rename = "initialPhases"))]
    initial_phases: HashMap<Id, f32>,

    /// Duration of simulation.
    duration: f32,
}

impl<ObType, MorType> SignedCoefficientBuilder<ObType, MorType> {
    /** Kuramoto model ODE analysis.

    This analysis solves the first-order Kuramoto model describing
    coupled oscillators
     */
    pub fn kuramoto_analysis<Id>(
        &self,
        model: &impl FgDblModel<ObType = ObType, MorType = MorType, Ob = Id, ObGen = Id, MorGen = Id>,
        data: KuramotoProblemData<Id>,
    ) -> ODEAnalysis<Id, KuramotoSystem>
    where
        Id: Eq + Clone + Hash + Ord,
    {
        let (interaction_matrix, ob_index) = self.build_matrix(model, &data.coupling_strengths);
        let n = ob_index.len();

        let frequency = ob_index
            .keys()
            .map(|ob| data.natural_frequencies.get(ob).copied().unwrap_or_default());
        let frequencies = DVector::from_iterator(n, frequency);

        let initial_phase = ob_index
            .keys()
            .map(|ob| data.initial_phases.get(ob).copied().unwrap_or_default());
        let x0 = DVector::from_iterator(n, initial_phase);

        let system = KuramotoSystem::new(interaction_matrix, frequencies);
        let problem = ODEProblem::new(system, x0).end_time(data.duration);
        ODEAnalysis::new(problem, ob_index)
    }
}

// #[cfg(test)]
// mod test {
//     use std::rc::Rc;
//     use ustr::ustr;

//     use super::*;
//     use crate::dbl::model::{MutDblModel, UstrDiscreteDblModel};
//     use crate::one::Path;
//     use crate::{simulate::ode::kuramoto, stdlib};

//     #[test]
//     fn neg_loops_pos_connector() {
//         let th = Rc::new(stdlib::theories::th_signed_category());

//         let (a, b, x) = (ustr("A"), ustr("B"), ustr("X"));
//         let (aa, ax, bx, xb) = (ustr("aa"), ustr("ax"), ustr("bx"), ustr("xb"));
//         let mut test_model = UstrDiscreteDblModel::new(th);
//         test_model.add_ob(a, ustr("Object"));
//         test_model.add_ob(b, ustr("Object"));
//         test_model.add_ob(x, ustr("Object"));
//         test_model.add_mor(aa, a, a, ustr("Negative").into());
//         test_model.add_mor(ax, a, x, Path::Id(ustr("Object")));
//         test_model.add_mor(bx, b, x, ustr("Negative").into());
//         test_model.add_mor(xb, x, b, Path::Id(ustr("Object")));

//         let data = KuramotoProblemData {
//             coupling_strength: [(aa, 0.3), (ax, 1.0), (bx, 2.0), (xb, 0.5)].into_iter().collect(),
//             initial_phase: [(a, 2.0), (b, 1.0), (x, 1.0)].into_iter().collect(),
//             duration: 10.0,
//         };
//         let analysis = SignedCoefficientBuilder::new(ustr("Object"))
//             .add_positive(Path::Id(ustr("Object")))
//             .add_negative(Path::single(ustr("Negative")))
//             .kuramoto_analysis(&test_model, data);
//         assert_eq!(analysis.problem, kuramoto::create_neg_loops_pos_connector());
//     }
// }
