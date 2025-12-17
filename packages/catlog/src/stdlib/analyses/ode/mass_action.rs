//! Mass-action ODE analysis of models.
//!
//! Such ODEs are based on the *law of mass action* familiar from chemistry and
//! mathematical epidemiology.

use std::collections::HashMap;

use indexmap::IndexMap;
use nalgebra::DVector;
use num_traits::Zero;
use rebop::gillespie;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::{ODEAnalysis, ODESolution};
use crate::dbl::{
    model::{DiscreteTabModel, FgDblModel, ModalDblModel, ModalOb, MutDblModel, TabEdge},
    theory::{ModalMorType, ModalObType, TabMorType, TabObType},
};
use crate::one::FgCategory;
use crate::simulate::ode::{NumericalPolynomialSystem, ODEProblem, PolynomialSystem};
use crate::zero::{alg::Polynomial, name, rig::Monomial, QualifiedName};

/// Data defining a mass-action ODE problem for a model.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct MassActionProblemData {
    /// Map from morphism IDs to rate coefficients (nonnegative reals).
    rates: HashMap<QualifiedName, f32>,

    /// Map from object IDs to initial values (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "initialValues"))]
    pub initial_values: HashMap<QualifiedName, f32>,

    /// Duration of simulation.
    pub duration: f32,
}

/// Stochastic mass-action analysis of a model.
pub struct StochasticMassActionAnalysis {
    /// Reaction network for the analysis.
    pub problem: rebop::gillespie::Gillespie,

    /// Map from object IDs to variable indices.
    pub variable_index: IndexMap<QualifiedName, usize>,

    /// Map from object IDs to initial values.
    pub initial_values: HashMap<QualifiedName, f32>,

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
                (id.clone(), vec![initial])
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

/// Symbolic parameter in mass-action polynomial system.
type Parameter<Id> = Polynomial<Id, f32, u8>;

/// Mass-action ODE analysis for Petri nets.
///
/// This struct implements the object part of the functorial semantics for reaction
/// networks (aka, Petri nets) due to [Baez & Pollard](crate::refs::ReactionNets).
pub struct PetriNetMassActionAnalysis {
    /// Object type for places.
    pub place_ob_type: ModalObType,
    /// Morphism type for transitions.
    pub transition_mor_type: ModalMorType,
}

impl Default for PetriNetMassActionAnalysis {
    fn default() -> Self {
        let ob_type = ModalObType::new(name("Object"));
        Self {
            place_ob_type: ob_type.clone(),
            transition_mor_type: ModalMorType::Zero(ob_type),
        }
    }
}

impl PetriNetMassActionAnalysis {
    /// Creates a mass-action system with symbolic rate coefficients.
    pub fn build_system(
        &self,
        model: &ModalDblModel,
    ) -> PolynomialSystem<QualifiedName, Parameter<QualifiedName>, u8> {
        let mut sys = PolynomialSystem::new();
        for ob in model.ob_generators_with_type(&self.place_ob_type) {
            sys.add_term(ob, Polynomial::zero());
        }
        for mor in model.mor_generators_with_type(&self.transition_mor_type) {
            let inputs = model
                .get_dom(&mor)
                .and_then(|ob| ob.clone().collect_product(None))
                .unwrap_or_default();
            let outputs = model
                .get_cod(&mor)
                .and_then(|ob| ob.clone().collect_product(None))
                .unwrap_or_default();

            let term: Monomial<_, _> =
                inputs.iter().map(|ob| (ob.clone().unwrap_generator(), 1)).collect();
            let term: Polynomial<_, _, _> =
                [(Parameter::generator(mor), term)].into_iter().collect();
            for input in inputs {
                sys.add_term(input.unwrap_generator(), -term.clone());
            }
            for output in outputs {
                sys.add_term(output.unwrap_generator(), term.clone());
            }
        }

        // Normalize since terms commonly cancel out in mass-action dynamics.
        sys.normalize()
    }

    /// Creates a mass-action system with numerical rate coefficients.
    pub fn build_numerical_system(
        &self,
        model: &ModalDblModel,
        data: MassActionProblemData,
    ) -> ODEAnalysis<NumericalPolynomialSystem<u8>> {
        into_numerical_system(self.build_system(model), data)
    }

    /// Creates a stochastic mass-action system.
    pub fn build_stochastic_system(
        &self,
        model: &ModalDblModel,
        data: MassActionProblemData,
    ) -> StochasticMassActionAnalysis {
        let ob_generators: Vec<_> = model.ob_generators_with_type(&self.place_ob_type).collect();

        let initial: Vec<_> = ob_generators
            .iter()
            .map(|id| data.initial_values.get(id).copied().unwrap_or_default() as isize)
            .collect();
        let mut problem = gillespie::Gillespie::new(initial, false);

        for mor in model.mor_generators_with_type(&self.transition_mor_type) {
            let inputs = model
                .get_dom(&mor)
                .and_then(|ob| ob.clone().collect_product(None))
                .unwrap_or_default();
            let outputs = model
                .get_cod(&mor)
                .and_then(|ob| ob.clone().collect_product(None))
                .unwrap_or_default();

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

/// Mass-action ODE analysis for stock-flow models.
pub struct StockFlowMassActionAnalysis {
    /// Object type for stocks.
    pub stock_ob_type: TabObType,
    /// Morphism types for flows between stocks.
    pub flow_mor_type: TabMorType,
    /// Morphism types for links for stocks to flows.
    pub pos_link_mor_type: TabMorType,
    /// Morphism types for links for stocks to flows.
    pub neg_link_mor_type: TabMorType,
}

impl Default for StockFlowMassActionAnalysis {
    fn default() -> Self {
        let stock_ob_type = TabObType::Basic(name("Object"));
        let flow_mor_type = TabMorType::Hom(Box::new(stock_ob_type.clone()));
        Self {
            stock_ob_type,
            flow_mor_type,
            pos_link_mor_type: TabMorType::Basic(name("PositiveLink")),
            neg_link_mor_type: TabMorType::Basic(name("NegativeLink")),
        }
    }
}

impl StockFlowMassActionAnalysis {
    /// Creates a mass-action system with symbolic rate coefficients.
    pub fn build_system(
        &self,
        model: &DiscreteTabModel,
    ) -> PolynomialSystem<QualifiedName, Parameter<QualifiedName>, u8> {
        let mut terms: HashMap<QualifiedName, Monomial<QualifiedName, u8>> = model
            .mor_generators_with_type(&self.flow_mor_type)
            .map(|flow| {
                let dom = model.mor_generator_dom(&flow).unwrap_basic();
                (flow, Monomial::generator(dom))
            })
            .collect();

        for link in model
            .mor_generators_with_type(&self.pos_link_mor_type)
            .chain(model.mor_generators_with_type(&self.neg_link_mor_type))
        {
            let dom = model.mor_generator_dom(&link).unwrap_basic();
            let path = model.mor_generator_cod(&link).unwrap_tabulated();
            let Some(TabEdge::Basic(cod)) = path.only() else {
                panic!("Codomain of link should be basic morphism");
            };
            if let Some(term) = terms.get_mut(&cod) {
                *term = std::mem::take(term) * Monomial::generator(dom);
            } else {
                panic!("Codomain of link does not belong to model");
            };
        }

        let terms: Vec<_> = terms
            .into_iter()
            .map(|(flow, term)| {
                let param = Parameter::generator(flow.clone());
                let poly: Polynomial<_, _, _> = [(param, term)].into_iter().collect();
                (flow, poly)
            })
            .collect();

        let mut sys = PolynomialSystem::new();
        for ob in model.ob_generators_with_type(&self.stock_ob_type) {
            sys.add_term(ob, Polynomial::zero());
        }
        for (flow, term) in terms.iter() {
            let dom = model.mor_generator_dom(flow).unwrap_basic();
            sys.add_term(dom, -term.clone());
        }
        for (flow, term) in terms {
            let cod = model.mor_generator_cod(&flow).unwrap_basic();
            sys.add_term(cod, term);
        }
        sys
    }

    /// Creates a mass-action system with numerical rate coefficients.
    pub fn build_numerical_system(
        &self,
        model: &DiscreteTabModel,
        data: MassActionProblemData,
    ) -> ODEAnalysis<NumericalPolynomialSystem<u8>> {
        into_numerical_system(self.build_system(model), data)
    }
}

fn into_numerical_system(
    sys: PolynomialSystem<QualifiedName, Parameter<QualifiedName>, u8>,
    data: MassActionProblemData,
) -> ODEAnalysis<NumericalPolynomialSystem<u8>> {
    let ob_index: IndexMap<_, _> =
        sys.components.keys().cloned().enumerate().map(|(i, x)| (x, i)).collect();
    let n = ob_index.len();

    let initial_values = ob_index
        .keys()
        .map(|ob| data.initial_values.get(ob).copied().unwrap_or_default());
    let x0 = DVector::from_iterator(n, initial_values);

    let sys = sys
        .extend_scalars(|poly| poly.eval(|flow| data.rates.get(flow).copied().unwrap_or_default()))
        .to_numerical();

    let problem = ODEProblem::new(sys, x0).end_time(data.duration);
    ODEAnalysis::new(problem, ob_index)
}

#[cfg(test)]
mod tests {
    use expect_test::expect;
    use std::rc::Rc;

    use super::*;
    use crate::stdlib::{models::*, theories::*};

    #[test]
    fn backward_link_dynamics() {
        let th = Rc::new(th_category_links());
        let model = backward_link(th);
        let sys = StockFlowMassActionAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            dx = ((-1) f) x y
            dy = f x y
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn catalysis_dynamics() {
        let th = Rc::new(th_sym_monoidal_category());
        let model = catalyzed_reaction(th);
        let sys = PetriNetMassActionAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            dc = 0
            dx = ((-1) f) c x
            dy = f c x
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn sir_petri_stochastic_dynamics() {
        let th = Rc::new(th_sym_monoidal_category());
        let model = sir_petri(th);
        let data = MassActionProblemData {
            rates: HashMap::from_iter([(name("infection"), 1e-5f32), (name("recovery"), 1e-2f32)]),
            initial_values: HashMap::from_iter([
                (name("S"), 1e5f32),
                (name("I"), 1f32),
                (name("R"), 0f32),
            ]),
            duration: 10f32,
        };
        let sys = PetriNetMassActionAnalysis::default().build_stochastic_system(&model, data);
        assert_eq!(2, sys.problem.nb_reactions());
        assert_eq!(3, sys.problem.nb_species());
    }
}
