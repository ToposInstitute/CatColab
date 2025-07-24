/*! Mass-action ODE analysis of models.

Such ODEs are based on the *law of mass action* familiar from chemistry and
mathematical epidemiology.
 */

use std::collections::{BTreeMap, HashMap};

use nalgebra::DVector;
use num_traits::Zero;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::ODEAnalysis;
use super::StochasticODEAnalysis;
use crate::dbl::{
    modal::model::ModalOb,
    model::{DiscreteTabModel, FgDblModel, ModalDblModel, MutDblModel, TabEdge},
    theory::{ModalMorType, ModalObType, TabMorType, TabObType},
};
use crate::one::FgCategory;
use crate::simulate::ode::{NumericalPolynomialSystem, ODEProblem, PolynomialSystem};
use crate::zero::{QualifiedName, alg::Polynomial, name, rig::Monomial};

use rebop::gillespie::{Gillespie, Rate};

/// Data defining a mass-action ODE problem for a model.
#[derive(Clone)]
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

/// Symbolic parameter in mass-action polynomial system.
type Parameter<Id> = Polynomial<Id, f32, u8>;

/** Mass-action ODE analysis for Petri nets.

This struct implements the object part of the functorial semantics for reaction
networks (aka, Petri nets) due to [Baez & Pollard](crate::refs::ReactionNets).
 */
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

    /// Creates a mass-action system in a reaction network.
    pub fn build_reaction(
        &self,
        model: &ModalDblModel,
        data: MassActionProblemData,
    ) -> StochasticODEAnalysis {
        let obs = model.ob_generators_with_type(&self.place_ob_type).collect::<Vec<_>>();
        let mut variable_index: BTreeMap<QualifiedName, usize> = Default::default();
        let ivs = obs
            .clone()
            .into_iter()
            .enumerate()
            .map(|(idx, ob)| match data.initial_values.get(&ob) {
                Some(iv) => {
                    variable_index.insert(ob, idx);
                    *iv as u32 as isize
                }
                None => 0, // TODO throw error
            })
            .collect::<Vec<isize>>();
        let mut problem = Gillespie::new(ivs, false);
        for mor in model.mor_generators_with_type(&self.transition_mor_type) {
            let inputs = model
                .get_dom(&mor)
                .and_then(|ob| ob.clone().collect_product(None))
                .unwrap_or_default();
            let outputs = model
                .get_cod(&mor)
                .and_then(|ob| ob.clone().collect_product(None))
                .unwrap_or_default();

            // 1. convert the inputs/outputs to arrays
            let input_vec = obs
                .clone()
                .into_iter()
                .map(|obstr| {
                    inputs
                        .iter()
                        .filter(|&g| {
                            if let ModalOb::Generator(id) = g {
                                *id == obstr
                            } else {
                                false
                            }
                        })
                        .count() as u32
                })
                .collect::<Vec<u32>>();
            let output_vec = obs
                .clone()
                .into_iter()
                .map(|obstr| {
                    outputs
                        .iter()
                        .filter(|&g| {
                            if let ModalOb::Generator(id) = g {
                                *id == obstr
                            } else {
                                false
                            }
                        })
                        .count() as isize
                })
                .collect::<Vec<isize>>();
            // 2. output := output - input
            let output_vec = output_vec
                .into_iter()
                .zip(input_vec.clone())
                .map(|(a, b)| a - (b as isize))
                .collect::<Vec<isize>>();
            if let Some(rate) = data.rates.get(&mor) {
                problem.add_reaction(Rate::lma(*rate as f64, input_vec), output_vec)
            }
        }
        StochasticODEAnalysis {
            problem,
            data,
            variable_index,
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
    pub link_mor_type: TabMorType,
}

impl Default for StockFlowMassActionAnalysis {
    fn default() -> Self {
        let stock_ob_type = TabObType::Basic(name("Object"));
        let flow_mor_type = TabMorType::Hom(Box::new(stock_ob_type.clone()));
        Self {
            stock_ob_type,
            flow_mor_type,
            link_mor_type: TabMorType::Basic(name("Link")),
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

        for link in model.mor_generators_with_type(&self.link_mor_type) {
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
    let ob_index: BTreeMap<_, _> =
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
    fn sir_petri_dynamics() {
        let th = Rc::new(th_sym_monoidal_category());
        let model = sir_petri(th);
        let sys = PetriNetMassActionAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            dI = ((-1) recovery) I + infection I S
            dR = recovery I
            dS = ((-1) infection) I S
        "#]);
        expected.assert_eq(&sys.to_string());
    }
}
