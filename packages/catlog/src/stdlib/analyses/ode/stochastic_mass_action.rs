//! Stochastic mass action anaylsis of ODEs.
//!
//! These stochastic mass-action use statistical methods to apply transitions.

use indexmap::IndexMap;
use rebop::gillespie;
use std::collections::HashMap;

use super::mass_action::PetriNetMassActionAnalysis;
use crate::{
    dbl::{modal::*, model::FgDblModel},
    zero::{name, QualifiedName},
};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

/// Data defining the stochastic mass-action ODE problem.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct StochasticMassActionProblemData {
    /// Map from morphism IDs to rate coefficients (nonnegative reals).
    rates: HashMap<QualifiedName, f32>,

    /// Map from object IDs to initial values (nonnegative integers).
    #[cfg_attr(feature = "serde", serde(rename = "initialValues"))]
    pub initial_values: HashMap<QualifiedName, u32>,

    /// Duration of simulation.
    pub duration: f32,
}

/// Stochastic mass-action analysis of a model.
pub struct StochasticMassActionAnalysis {
    /// Reaction network for the analysis.
    pub problem: rebop::gillespie::Gillespie,

    /// Map from object IDs to variable indices.
    pub variable_index: IndexMap<QualifiedName, usize>,

    /// Map from object IDs to initial values (nonnegative integers).
    pub initial_values: HashMap<QualifiedName, u32>,

    /// Duration of simulation.
    pub duration: f32,
}

impl StochasticMassActionAnalysis {
    /// Simulates the stochastic mass-action system and collects the results.
    pub fn simulate(&mut self) -> ODESolution {
        let mut time = vec![0.0];
        let mut states: HashMap<_, _> = self
            .variable_index
            .keys()
            .map(|id| {
                let initial = self.initial_values.get(id).copied().unwrap_or_default();
                (id.clone(), vec![initial as f32])
            })
            .collect();
        for t in 0..(self.duration as usize) {
            self.problem.advance_until(t as f64);
            time.push(self.problem.get_time() as f32);
            for (id, idx) in self.variable_index.iter() {
                states.get_mut(id).unwrap().push(self.problem.get_species(*idx) as f32)
            }
        }
        ODESolution { time, states }
    }
}

impl PetriNetMassActionAnalysis {
    /// Creates a stochastic mass-action system.
    pub fn build_stochastic_system(
        &self,
        model: &ModalDblModel,
        data: StochasticMassActionProblemData,
    ) -> StochasticMassActionAnalysis {
        let ob_generators: Vec<_> = model.ob_generators_with_type(&self.place_ob_type).collect();

        let initial: Vec<_> = ob_generators
            .iter()
            .map(|id| data.initial_values.get(id).copied().unwrap_or_default() as isize)
            .collect();
        let mut problem = gillespie::Gillespie::new(initial, false);

        for mor in model.mor_generators_with_type(&self.transition_mor_type) {
            let (inputs, outputs) = Self::transition_interface(model, &mor);

            // 1. convert the inputs/outputs to sequences of counts
            let input_vec = ob_generators.iter().map(|id| {
                inputs
                    .iter()
                    .filter(|&ob| matches!(ob, ModalOb::Generator(id2) if id2 == id))
                    .count() as u32
            });
            let output_vec = ob_generators.iter().map(|id| {
                outputs
                    .iter()
                    .filter(|&ob| matches!(ob, ModalOb::Generator(id2) if id2 == id))
                    .count() as isize
            });

            // 2. output := output - input
            let input_vec: Vec<_> = input_vec.collect();
            let output_vec: Vec<_> = output_vec
                .zip(input_vec.iter().copied())
                .map(|(o, i)| o - (i as isize))
                .collect();
            if let Some(rate) = data.rates.get(&mor) {
                problem.add_reaction(gillespie::Rate::lma(*rate as f64, input_vec), output_vec)
            }
        }

        let variable_index: IndexMap<_, _> =
            ob_generators.into_iter().enumerate().map(|(i, x)| (x, i)).collect();

        StochasticMassActionAnalysis {
            problem,
            variable_index,
            initial_values: data.initial_values,
            duration: data.duration,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::rc::Rc;

    use super::*;
    use crate::stdlib::sir_petri;
    use crate::stdlib::theories::*;

    #[test]
    fn sir_petri_stochastic_dynamics() {
        let th = Rc::new(th_sym_monoidal_category());
        let model = sir_petri(th);
        let data = StochasticMassActionProblemData {
            rates: HashMap::from_iter([(name("infect"), 1e-5f32), (name("recover"), 1e-2f32)]),
            initial_values: HashMap::from_iter([
                (name("S"), 1e5 as u32),
                (name("I"), 1),
                (name("R"), 0),
            ]),
            duration: 10f32,
        };
        let sys = PetriNetMassActionAnalysis::default().build_stochastic_system(&model, data);
        assert_eq!(2, sys.problem.nb_reactions());
        assert_eq!(3, sys.problem.nb_species());
    }
}
