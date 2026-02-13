//! Unbalanced mass-action ODE analysis of models.
//!
//! Such ODEs are a "weaker" version of those from mass-action dynamics, in that
//! we do not here require that mass be preserved. This allows the construction
//! of systems of arbitrary polynomial (first-order) ODEs.

use std::{collections::HashMap, fmt};

use indexmap::IndexMap;
use nalgebra::DVector;
use num_traits::Zero;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::{ODEAnalysis, mass_action::*};
use crate::dbl::model::{DiscreteTabModel, FgDblModel, ModalDblModel};
use crate::one::FgCategory;
use crate::simulate::ode::{NumericalPolynomialSystem, ODEProblem, PolynomialSystem};
use crate::zero::{QualifiedName, alg::Polynomial, rig::Monomial};

/// There are three types of mass-action semantics:
/// - balanced
/// - unbalanced (rates per transition)
/// - unbalanced (rates per place)
/// Each one is strictly more expressive than the last.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone, Serialize, Deserialize)]
pub enum MassConservationType {
    Balanced,
    Unbalanced(RateGranularity),
}

/// When mass is not necessarily conserved, consumption/production rate parameters
/// can be set either *per transition* or *per place*.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone, Serialize, Deserialize, Copy)]
pub enum RateGranularity {
    /// Each transition gets assigned a single consumption and single production rate
    PerTransition,

    /// Each transition gets assigned a consumption rate for each input place and
    /// a production rate for each output place.
    PerPlace,
}

/// Terms in the generated polynomial equations are *undirected* in the balanced case
/// and *directed* in the unbalanced case.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone)]
pub enum Term {
    UndirectedTerm {
        transition: QualifiedName,
    },
    DirectedTerm {
        direction: Direction,
        parameter: RateParameter,
    },
}

/// Depending on the rate granularity, the parameters are specified by different structures.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone)]
pub enum RateParameter {
    /// For per transition rates, we simply need to know the associated transition.
    PerTransition { transition: QualifiedName },

    /// For per place rates, we need to know both the transition and the corresponding
    /// input/output place.
    PerPlace {
        transition: QualifiedName,
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
pub struct UnbalancedMassActionProblemData {
    /// Whether or not mass is conserved.
    #[cfg_attr(feature = "serde", serde(rename = "massConservationType"))]
    pub mass_conservation_type: MassConservationType,

    /// Map from morphism IDs to consumption rate coefficients (nonnegative reals),
    /// for the per transition case.
    #[cfg_attr(feature = "serde", serde(rename = "transitionConsumptionRates"))]
    transition_consumption_rates: HashMap<QualifiedName, f32>,

    /// Map from morphism IDs to production rate coefficients (nonnegative reals),
    /// for the per transition case.
    #[cfg_attr(feature = "serde", serde(rename = "transitionProductionRates"))]
    transition_production_rates: HashMap<QualifiedName, f32>,

    /// Map from morphism IDs to (map from input objects to consumption rate coefficients),
    /// for the per place case (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "placeConsumptionRates"))]
    place_consumption_rates: HashMap<QualifiedName, HashMap<QualifiedName, f32>>,

    /// Map from morphism IDs to (map from output objects to production rate coefficients),
    /// for the per place case (nonnegative reals).
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

impl StockFlowMassActionAnalysis {
    /// TODO: this should eventually just be called build_system()
    /// Creates an unbalanced mass-action system with symbolic rate coefficients.
    pub fn build_unbalanced_system(
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
}

impl PetriNetMassActionAnalysis {
    /// TODO: this should eventually be renamed just build_system()
    /// Creates an unbalanced mass-action system with symbolic rate coefficients.
    pub fn build_unbalanced_system(
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

/// Substitutes numerical rate coefficients into a symbolic mass-action system.
pub fn extend_unbalanced_mass_action_scalars(
    sys: PolynomialSystem<QualifiedName, Parameter<Term>, i8>,
    data: &UnbalancedMassActionProblemData,
) -> PolynomialSystem<QualifiedName, f32, i8> {
    sys.extend_scalars(|poly| {
        poly.eval(|flow| match flow {
            Term::UndirectedTerm { transition } => {
                data.transition_production_rates.get(transition).cloned().unwrap_or_default()
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
    })
}

/// Builds the numerical ODE analysis for a mass-action system whose scalars have been substituted.
pub fn into_unbalanced_mass_action_analysis(
    sys: PolynomialSystem<QualifiedName, f32, i8>,
    data: UnbalancedMassActionProblemData,
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
    use crate::stdlib::{models::*, theories::*};

    #[test]
    fn backward_link_dynamics() {
        let th = Rc::new(th_category_links());
        let model = backward_link(th);
        let sys = StockFlowMassActionAnalysis::default().build_unbalanced_system(&model);
        let expected = expect!([r#"
            dx = (-(x->[f])) x y
            dy = (([f]->y)) x y
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn positive_backward_link_dynamics() {
        let th = Rc::new(th_category_signed_links());
        let model = positive_backward_link(th);
        let sys = StockFlowMassActionAnalysis::default().build_unbalanced_system(&model);
        let expected = expect!([r#"
            dx = (-(x->[f])) x y
            dy = (([f]->y)) x y
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn negative_backward_link_dynamics() {
        let th = Rc::new(th_category_signed_links());
        let model = negative_backward_link(th);
        let sys = StockFlowMassActionAnalysis::default().build_unbalanced_system(&model);
        let expected = expect!([r#"
            dx = (-(x->[f])) x y^{-1}
            dy = (([f]->y)) x y^{-1}
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn catalysis_dynamics() {
        let th = Rc::new(th_sym_monoidal_category());
        let model = catalyzed_reaction(th);
        let sys = PetriNetMassActionAnalysis::default().build_unbalanced_system(&model);
        // Note that the catalyst c is not left unchanged unless f is "balanced"
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
        let sys = StockFlowMassActionAnalysis::default().build_unbalanced_system(&model);
        let expected = vec![
            LatexEquation {
                lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} x".to_string(),
                rhs: "(-(x->[f])) x y".to_string(),
            },
            LatexEquation {
                lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} y".to_string(),
                rhs: "(([f]->y)) x y".to_string(),
            },
        ];
        assert_eq!(expected, sys.to_latex_equations());
    }
}
