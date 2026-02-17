//! Mass-action ODE analysis of models.
//!
//!
//! Such ODEs are based on the *law of mass action* familiar from chemistry and
//! mathematical epidemiology. Here, however, we also consider generalised version
//! where we do not require that mass be preserved. This allows the construction
//! of systems of arbitrary polynomial (first-order) ODEs.

use std::{collections::HashMap, fmt};

use indexmap::IndexMap;
use nalgebra::DVector;
use num_traits::Zero;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::ODEAnalysis;
use crate::dbl::{
    model::{DiscreteTabModel, FgDblModel, ModalDblModel, ModalOb, MutDblModel, TabEdge},
    theory::{ModalMorType, ModalObType, TabMorType, TabObType},
};
use crate::one::FgCategory;
use crate::simulate::ode::{NumericalPolynomialSystem, ODEProblem, PolynomialSystem};
use crate::zero::name;
use crate::zero::{QualifiedName, alg::Polynomial, rig::Monomial};

/// There are three types of mass-action semantics, each more expressive than the previous:
/// - balanced
/// - unbalanced (rates per transition)
/// - unbalanced (rates per place)
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone, Copy)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(tag = "type", content = "granularity"))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub enum MassConservationType {
    /// Mass is conserved.
    Balanced,
    /// Mass is not conserved.
    Unbalanced(RateGranularity),
}

/// When mass is not necessarily conserved, consumption/production rate parameters
/// can be set either *per transition* or *per place*.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone, Copy)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub enum RateGranularity {
    /// Each transition gets assigned a single consumption and single production rate.
    PerTransition,

    /// Each transition gets assigned a consumption rate for each input place and
    /// a production rate for each output place.
    PerPlace,
}

/// Terms in the generated polynomial equations are *undirected* in the balanced case
/// and *directed* in the unbalanced case.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone)]
pub enum Term {
    /// If mass is conserved, we don't need to worry whether a flow is incoming or outgoing.
    UndirectedTerm {
        /// Since there is no direction, the rate parameter corresponds to a single transition.
        transition: QualifiedName,
    },
    /// If mass is not conserved, then we need to know whether a flow is incoming or outgoing.
    DirectedTerm {
        /// The direction of the flow.
        direction: Direction,
        /// The structure of the rate parameter can be either per transition or per place.
        parameter: RateParameter,
    },
}

/// Depending on the rate granularity, the parameters are specified by different structures.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone)]
pub enum RateParameter {
    /// For per transition rates, we simply need to know the associated transition.
    PerTransition {
        /// The transition to which we associate the rate parameter.
        transition: QualifiedName,
    },

    /// For per place rates, we need to know both the transition and the corresponding
    /// input/output place.
    PerPlace {
        /// The transition whose input/output objects we wish to associate rate parameters.
        transition: QualifiedName,
        /// The input/output object to which we associate the rate parameter.
        place: QualifiedName,
    },
}

/// The associated direction of a "flow" term. Note that this is *opposite* from
/// the terminology of "input" and "output", i.e. a flow A=>B gives rise to an
/// *incoming flow to B* and an *outgoing flow from A*.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone)]
pub enum Direction {
    /// The parameter corresponds to an incoming flow to a specific output.
    IncomingFlow,

    /// The parameter corresponds to an outgoing flow to a specific input.
    OutgoingFlow,
}

impl fmt::Display for Term {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self {
            Term::UndirectedTerm { transition: trans } => {
                write!(f, "{}", trans)
            }
            Term::DirectedTerm {
                direction: Direction::IncomingFlow,
                parameter: RateParameter::PerTransition { transition: trans },
            } => {
                write!(f, "Incoming({})", trans)
            }
            Term::DirectedTerm {
                direction: Direction::IncomingFlow,
                parameter: RateParameter::PerPlace { transition: trans, place: output },
            } => {
                write!(f, "([{}]->{})", trans, output)
            }
            Term::DirectedTerm {
                direction: Direction::OutgoingFlow,
                parameter: RateParameter::PerTransition { transition: trans },
            } => {
                write!(f, "Outgoing({})", trans)
            }
            Term::DirectedTerm {
                direction: Direction::OutgoingFlow,
                parameter: RateParameter::PerPlace { transition: trans, place: input },
            } => {
                write!(f, "({}->[{}])", input, trans)
            }
        }
    }
}

/// Data defining an unbalanced mass-action ODE problem for a model.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct MassActionProblemData {
    /// Whether or not mass is conserved.
    #[cfg_attr(feature = "serde", serde(rename = "massConservationType"))]
    pub mass_conservation_type: MassConservationType,

    /// Map from morphism IDs to consumption rate coefficients (nonnegative reals),
    /// for the balanced per transition case.
    #[cfg_attr(feature = "serde", serde(rename = "transitionRates"))]
    transition_rates: HashMap<QualifiedName, f32>,

    /// Map from morphism IDs to consumption rate coefficients (nonnegative reals),
    /// for the unbalanced per transition case.
    #[cfg_attr(feature = "serde", serde(rename = "transitionConsumptionRates"))]
    transition_consumption_rates: HashMap<QualifiedName, f32>,

    /// Map from morphism IDs to production rate coefficients (nonnegative reals),
    /// for the unbalanced per transition case.
    #[cfg_attr(feature = "serde", serde(rename = "transitionProductionRates"))]
    transition_production_rates: HashMap<QualifiedName, f32>,

    /// Map from morphism IDs to (map from input objects to consumption rate coefficients),
    /// for the unbalanced per place case (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "placeConsumptionRates"))]
    place_consumption_rates: HashMap<QualifiedName, HashMap<QualifiedName, f32>>,

    /// Map from morphism IDs to (map from output objects to production rate coefficients),
    /// for the unbalanced per place case (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "placeProductionRates"))]
    place_production_rates: HashMap<QualifiedName, HashMap<QualifiedName, f32>>,

    /// Map from object IDs to initial values (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "initialValues"))]
    pub initial_values: HashMap<QualifiedName, f32>,

    /// Duration of simulation.
    pub duration: f32,
}

/// Symbolic parameter in mass-action polynomial system.
type Parameter<Id> = Polynomial<Id, f32, i8>;

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
    /// Gets the inputs and outputs of a transition.
    pub(super) fn transition_interface(
        model: &ModalDblModel,
        id: &QualifiedName,
    ) -> (Vec<ModalOb>, Vec<ModalOb>) {
        let inputs = model
            .get_dom(id)
            .and_then(|ob| ob.clone().collect_product(None))
            .unwrap_or_default();
        let outputs = model
            .get_cod(id)
            .and_then(|ob| ob.clone().collect_product(None))
            .unwrap_or_default();
        (inputs, outputs)
    }

    /// Creates a mass-action system with symbolic rate coefficients.
    pub fn build_system(
        &self,
        model: &ModalDblModel,
        mass_conservation_type: MassConservationType,
    ) -> PolynomialSystem<QualifiedName, Parameter<Term>, i8> {
        let mut sys = PolynomialSystem::new();
        for ob in model.ob_generators_with_type(&self.place_ob_type) {
            sys.add_term(ob, Polynomial::zero());
        }
        for mor in model.mor_generators_with_type(&self.transition_mor_type) {
            let (inputs, outputs) = Self::transition_interface(model, &mor);
            let term: Monomial<_, _> =
                inputs.iter().map(|ob| (ob.clone().unwrap_generator(), 1)).collect();

            match mass_conservation_type {
                MassConservationType::Balanced => {
                    let term: Polynomial<_, _, _> = [(
                        Parameter::generator(Term::UndirectedTerm { transition: mor }),
                        term.clone(),
                    )]
                    .into_iter()
                    .collect();

                    for input in inputs {
                        sys.add_term(input.unwrap_generator(), -term.clone());
                    }
                }

                MassConservationType::Unbalanced(granularity) => {
                    for input in inputs {
                        let input_term: Polynomial<_, _, _> = match granularity {
                            RateGranularity::PerTransition => [(
                                Parameter::generator(Term::DirectedTerm {
                                    direction: Direction::OutgoingFlow,
                                    parameter: RateParameter::PerTransition {
                                        transition: mor.clone(),
                                    },
                                }),
                                term.clone(),
                            )],
                            RateGranularity::PerPlace => [(
                                Parameter::generator(Term::DirectedTerm {
                                    direction: Direction::OutgoingFlow,
                                    parameter: RateParameter::PerPlace {
                                        transition: mor.clone(),
                                        place: input.clone().unwrap_generator(),
                                    },
                                }),
                                term.clone(),
                            )],
                        }
                        .into_iter()
                        .collect();

                        sys.add_term(input.unwrap_generator(), -input_term.clone());
                    }
                    for output in outputs {
                        let output_term: Polynomial<_, _, _> = match granularity {
                            RateGranularity::PerTransition => [(
                                Parameter::generator(Term::DirectedTerm {
                                    direction: Direction::IncomingFlow,
                                    parameter: RateParameter::PerTransition {
                                        transition: mor.clone(),
                                    },
                                }),
                                term.clone(),
                            )],
                            RateGranularity::PerPlace => [(
                                Parameter::generator(Term::DirectedTerm {
                                    direction: Direction::IncomingFlow,
                                    parameter: RateParameter::PerPlace {
                                        transition: mor.clone(),
                                        place: output.clone().unwrap_generator(),
                                    },
                                }),
                                term.clone(),
                            )],
                        }
                        .into_iter()
                        .collect();

                        sys.add_term(output.unwrap_generator(), output_term.clone());
                    }
                }
            }
        }

        sys.normalize()
    }
}

/// Mass-action ODE analysis for stock-flow models.
pub struct StockFlowMassActionAnalysis {
    /// Object type for stocks.
    pub stock_ob_type: TabObType,
    /// Morphism type for flows between stocks.
    pub flow_mor_type: TabMorType,
    /// Morphism type for positive links from stocks to flows.
    pub pos_link_mor_type: TabMorType,
    /// Morphism type for negative links from stocks to flows.
    pub neg_link_mor_type: TabMorType,
}

impl Default for StockFlowMassActionAnalysis {
    fn default() -> Self {
        let stock_ob_type = TabObType::Basic(name("Object"));
        let flow_mor_type = TabMorType::Hom(Box::new(stock_ob_type.clone()));
        Self {
            stock_ob_type,
            flow_mor_type,
            pos_link_mor_type: TabMorType::Basic(name("Link")),
            neg_link_mor_type: TabMorType::Basic(name("NegativeLink")),
        }
    }
}

impl StockFlowMassActionAnalysis {
    /// Creates a mass-action system with symbolic rate coefficients.
    pub fn build_system(
        &self,
        model: &DiscreteTabModel,
        mass_conservation_type: MassConservationType,
    ) -> PolynomialSystem<QualifiedName, Parameter<Term>, i8> {
        let terms: Vec<_> = self.flow_monomials(model).into_iter().collect();

        let mut sys = PolynomialSystem::new();
        for ob in model.ob_generators_with_type(&self.stock_ob_type) {
            sys.add_term(ob, Polynomial::zero());
        }
        for (flow, term) in terms {
            let dom = model.mor_generator_dom(&flow).unwrap_basic();
            let cod = model.mor_generator_cod(&flow).unwrap_basic();
            match mass_conservation_type {
                MassConservationType::Balanced => {
                    let param = Parameter::generator(Term::UndirectedTerm { transition: flow });
                    let term: Polynomial<_, _, _> = [(param, term.clone())].into_iter().collect();
                    sys.add_term(dom, -term.clone());
                    sys.add_term(cod, term);
                }
                MassConservationType::Unbalanced(_) => {
                    let dom_param = Parameter::generator(Term::DirectedTerm {
                        direction: Direction::OutgoingFlow,
                        parameter: RateParameter::PerTransition { transition: flow.clone() },
                    });
                    let cod_param = Parameter::generator(Term::DirectedTerm {
                        direction: Direction::IncomingFlow,
                        parameter: RateParameter::PerTransition { transition: flow },
                    });
                    let dom_term: Polynomial<_, _, _> =
                        [(dom_param, term.clone())].into_iter().collect();
                    let cod_term: Polynomial<_, _, _> = [(cod_param, term)].into_iter().collect();
                    sys.add_term(dom, -dom_term);
                    sys.add_term(cod, cod_term);
                }
            }
        }
        sys
    }

    /// Constructs a monomial for each flow in the model.
    pub(super) fn flow_monomials(
        &self,
        model: &DiscreteTabModel,
    ) -> HashMap<QualifiedName, Monomial<QualifiedName, i8>> {
        let mut terms: HashMap<_, _> = model
            .mor_generators_with_type(&self.flow_mor_type)
            .map(|flow| {
                let dom = model.mor_generator_dom(&flow).unwrap_basic();
                (flow, Monomial::generator(dom))
            })
            .collect();

        let mut multiply_for_link = |link: QualifiedName, exponent: i8| {
            let dom = model.mor_generator_dom(&link).unwrap_basic();
            let path = model.mor_generator_cod(&link).unwrap_tabulated();
            let Some(TabEdge::Basic(cod)) = path.only() else {
                panic!("Codomain of link should be basic morphism");
            };
            if let Some(term) = terms.get_mut(&cod) {
                let mon: Monomial<_, i8> = [(dom, exponent)].into_iter().collect();
                *term = std::mem::take(term) * mon;
            } else {
                panic!("Codomain of link does not belong to model");
            };
        };

        for link in model.mor_generators_with_type(&self.pos_link_mor_type) {
            multiply_for_link(link, 1);
        }
        for link in model.mor_generators_with_type(&self.neg_link_mor_type) {
            multiply_for_link(link, -1);
        }

        terms
    }
}

/// Substitutes numerical rate coefficients into a symbolic mass-action system.
pub fn extend_mass_action_scalars(
    sys: PolynomialSystem<QualifiedName, Parameter<Term>, i8>,
    data: &MassActionProblemData,
) -> PolynomialSystem<QualifiedName, f32, i8> {
    let sys = sys.extend_scalars(|poly| {
        poly.eval(|flow| match flow {
            Term::UndirectedTerm { transition } => {
                data.transition_rates.get(transition).cloned().unwrap_or_default()
            }
            Term::DirectedTerm { direction, parameter } => match (direction, parameter) {
                (Direction::IncomingFlow, RateParameter::PerTransition { transition }) => {
                    data.transition_production_rates.get(transition).cloned().unwrap_or_default()
                }
                (Direction::OutgoingFlow, RateParameter::PerTransition { transition }) => {
                    data.transition_consumption_rates.get(transition).cloned().unwrap_or_default()
                }
                (Direction::IncomingFlow, RateParameter::PerPlace { transition, place }) => data
                    .place_production_rates
                    .get(transition)
                    .cloned()
                    .unwrap_or_default()
                    .get(place)
                    .copied()
                    .unwrap_or_default(),
                (Direction::OutgoingFlow, RateParameter::PerPlace { transition, place }) => data
                    .place_consumption_rates
                    .get(transition)
                    .cloned()
                    .unwrap_or_default()
                    .get(place)
                    .copied()
                    .unwrap_or_default(),
            },
        })
    });

    sys.normalize()
}

/// Builds the numerical ODE analysis for a mass-action system whose scalars have been substituted.
pub fn into_mass_action_analysis(
    sys: PolynomialSystem<QualifiedName, f32, i8>,
    data: MassActionProblemData,
) -> ODEAnalysis<NumericalPolynomialSystem<i8>> {
    let ob_index: IndexMap<_, _> =
        sys.components.keys().cloned().enumerate().map(|(i, x)| (x, i)).collect();
    let n = ob_index.len();

    let initial_values = ob_index
        .keys()
        .map(|ob| data.initial_values.get(ob).copied().unwrap_or_default());
    let x0 = DVector::from_iterator(n, initial_values);

    let num_sys = sys.to_numerical();
    let problem = ODEProblem::new(num_sys, x0).end_time(data.duration);

    ODEAnalysis::new(problem, ob_index)
}

#[cfg(test)]
mod tests {
    use expect_test::expect;
    use std::rc::Rc;

    use super::*;
    use crate::simulate::ode::LatexEquation;
    use crate::stdlib::{analyses, models::*, theories::*};

    #[test]
    fn balanced_backward_link_dynamics() {
        let th = Rc::new(th_category_links());
        let model = backward_link(th);
        let sys = StockFlowMassActionAnalysis::default()
            .build_system(&model, analyses::ode::MassConservationType::Balanced);
        let expected = expect!([r#"
            dx = (-f) x y
            dy = f x y
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn unbalanced_positive_backward_link_dynamics() {
        let th = Rc::new(th_category_signed_links());
        let model = positive_backward_link(th);
        let sys = StockFlowMassActionAnalysis::default().build_system(
            &model,
            analyses::ode::MassConservationType::Unbalanced(
                analyses::ode::RateGranularity::PerTransition,
            ),
        );
        let expected = expect!([r#"
            dx = (-Outgoing(f)) x y
            dy = (Incoming(f)) x y
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn balanced_negative_backward_link_dynamics() {
        let th = Rc::new(th_category_signed_links());
        let model = negative_backward_link(th);
        let sys = StockFlowMassActionAnalysis::default()
            .build_system(&model, analyses::ode::MassConservationType::Balanced);
        let expected = expect!([r#"
            dx = (-f) x y^{-1}
            dy = f x y^{-1}
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn catalysis_dynamics() {
        let th = Rc::new(th_sym_monoidal_category());
        let model = catalyzed_reaction(th);
        let sys = PetriNetMassActionAnalysis::default().build_system(
            &model,
            analyses::ode::MassConservationType::Unbalanced(
                analyses::ode::RateGranularity::PerPlace,
            ),
        );
        // Note that the catalyst c is not left unchanged unless f is balanced
        let expected = expect!([r#"
            dx = (-(x->[f])) c x
            dy = (([f]->y)) c x
            dc = (([f]->c) + -(c->[f])) c x
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn to_latex() {
        let th = Rc::new(th_category_links());
        let model = backward_link(th);
        let sys = StockFlowMassActionAnalysis::default().build_system(
            &model,
            analyses::ode::MassConservationType::Unbalanced(
                analyses::ode::RateGranularity::PerTransition,
            ),
        );
        let expected = vec![
            LatexEquation {
                lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} x".to_string(),
                rhs: "(-Outgoing(f)) x y".to_string(),
            },
            LatexEquation {
                lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} y".to_string(),
                rhs: "(Incoming(f)) x y".to_string(),
            },
        ];
        assert_eq!(expected, sys.to_latex_equations());
    }
}
