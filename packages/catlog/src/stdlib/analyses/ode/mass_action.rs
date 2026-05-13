//! Mass-action ODE analysis of models.
//!
//! Such ODEs are based on the *law of mass action* familiar from chemistry and
//! mathematical epidemiology. Here, however, we also consider a generalised version
//! where we do not require that mass be preserved. This allows the construction
//! of systems of arbitrary polynomial (first-order) ODEs.

use std::{collections::HashMap, fmt, rc::Rc};

use indexmap::IndexMap;
use nalgebra::DVector;
use num_traits::Zero;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::{ODEAnalysis, Parameter};
use crate::one::FgCategory;
use crate::simulate::ode::{NumericalPolynomialSystem, ODEProblem, PolynomialSystem};
use crate::stdlib::analyses::ode::PolynomialODEAnalysis;
use crate::stdlib::analyses::petri::transition_interface;
use crate::zero::name_seg;
use crate::zero::{QualifiedName, alg::Polynomial, name, rig::Monomial};
use crate::{
    dbl::{
        modal::List,
        model::{DiscreteTabModel, FpDblModel, ModalDblModel, ModalOb, MutDblModel, TabEdge},
        theory::{ModalMorType, ModalObType, TabMorType, TabObType, Unital},
    },
    stdlib::th_signed_polynomial_ode_system,
};

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

/// Parameters in the generated polynomial equations are *undirected* in the
/// balanced case and *directed* in the unbalanced case.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone)]
pub enum FlowParameter {
    /// If mass is conserved, we don't need to worry whether a flow is incoming or outgoing.
    Balanced {
        /// Since there is no direction, the rate parameter corresponds to a single transition.
        transition: QualifiedName,
    },
    /// If mass is not conserved, then we need to know whether a flow is incoming or outgoing.
    Unbalanced {
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

impl fmt::Display for FlowParameter {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self {
            FlowParameter::Balanced { transition: trans } => {
                write!(f, "{}", trans)
            }
            FlowParameter::Unbalanced {
                direction: Direction::IncomingFlow,
                parameter: RateParameter::PerTransition { transition: trans },
            } => {
                write!(f, "Incoming({})", trans)
            }
            FlowParameter::Unbalanced {
                direction: Direction::IncomingFlow,
                parameter: RateParameter::PerPlace { transition: trans, place: output },
            } => {
                write!(f, "([{}]->{})", trans, output)
            }
            FlowParameter::Unbalanced {
                direction: Direction::OutgoingFlow,
                parameter: RateParameter::PerTransition { transition: trans },
            } => {
                write!(f, "Outgoing({})", trans)
            }
            FlowParameter::Unbalanced {
                direction: Direction::OutgoingFlow,
                parameter: RateParameter::PerPlace { transition: trans, place: input },
            } => {
                write!(f, "({}->[{}])", input, trans)
            }
        }
    }
}

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
        model: &ModalDblModel<Unital>,
        mass_conservation_type: MassConservationType,
    ) -> PolynomialSystem<QualifiedName, Parameter<FlowParameter>, i8> {
        // We will create ("derive") a model in the theory of signed polynomial ODE systems.
        let ode_theory = Rc::new(th_signed_polynomial_ode_system());
        let mut ode_model = ModalDblModel::new(ode_theory);

        // We will apply `polynomial_ode::PolynomialODEAnalysis.build_system_custom_parameters()`
        // to the `ode_model` that we create. Further documentation can be found in `polynomial_ode`.
        let ode_analysis = PolynomialODEAnalysis::default();
        let ode_ob_type = ode_analysis.variable_ob_type;
        let ode_pos_cont_type = ode_analysis.positive_contribution_mor_type;
        let ode_neg_cont_type = ode_analysis.negative_contribution_mor_type;
        let mut associated_parameters: HashMap<QualifiedName, FlowParameter> = HashMap::new();

        // For every object in our Petri net (i.e. of type `place_ob_type`) we want to create
        // an object in our ODE model (i.e. of type `ode_ob_type`).
        for ob in model.ob_generators_with_type(&self.place_ob_type) {
            ode_model.add_ob(ob, ode_ob_type.clone());
        }

        // For every morphism in our Petri net we want to create, not just morphisms in our
        // ODE model (of the right sign), but also the desired parameter that should be used
        // by `PolynomialODEAnalysis.build_system_custom_parameters()` when constructing the
        // output of type PolynomialSystem<QualifiedName, Parameter<T>, i8>.
        //
        // Note that a single morphism in a Petri net gives rise to multiple morphisms in the
        // derived model of signed polynomial ODE systems, according to its interface. For example,
        // a single transition T: [a,b] -> [x,y] in `model` will give four morphisms in `ode_model`,
        // namely two positive contributions (ab -> x , ab -> y) and two negative (ab -> a , ab -> b).
        for mor in model.mor_generators_with_type(&self.transition_mor_type) {
            let (inputs, outputs) = transition_interface(model, &mor);
            let term = ModalOb::List(List::Symmetric, inputs.clone());

            for input in inputs {
                let input_place = input.clone().unwrap_generator();

                // A parameter is constructed according to `mass_conservation_type`. Note again
                // that this parameter need not be unique. Indeed, for every case apart from
                // `MassConservationType::Unbalanced(RateGranularity::PerPlace)`, the same
                // parameter will be constructed for each value of `input`.
                let parameter: FlowParameter = match mass_conservation_type {
                    MassConservationType::Balanced => {
                        FlowParameter::Balanced { transition: mor.clone() }
                    }
                    MassConservationType::Unbalanced(granularity) => match granularity {
                        RateGranularity::PerTransition => FlowParameter::Unbalanced {
                            direction: Direction::OutgoingFlow,
                            parameter: RateParameter::PerTransition { transition: mor.clone() },
                        },
                        RateGranularity::PerPlace => FlowParameter::Unbalanced {
                            direction: Direction::OutgoingFlow,
                            parameter: RateParameter::PerPlace {
                                transition: mor.clone(),
                                place: input_place.clone(),
                            },
                        },
                    },
                };

                // Due to the aforementioned fact that a single morphism in `model` gives multiple
                // morphisms in `ode_model` (according to its interface), we need to give new names
                // to each one. These names can be anything, but we opt to name the e.g. the morphism
                // ab -> a (from the example above) "T.ToInput.a".
                let name = mor.clone().snoc(name_seg("ToInput")).snoc(input_place.only().unwrap());

                associated_parameters.insert(name.clone(), parameter);
                ode_model.add_mor(name, term.clone(), input, ode_neg_cont_type.clone());
            }

            // For outputs, we do the same as for inputs but create `Direction::IncomingFlow` parameters
            // and `ode_pos_cont_type` contributions instead.
            for output in outputs {
                let output_place = output.clone().unwrap_generator();

                let parameter: FlowParameter = match mass_conservation_type {
                    MassConservationType::Balanced => {
                        FlowParameter::Balanced { transition: mor.clone() }
                    }
                    MassConservationType::Unbalanced(granularity) => match granularity {
                        RateGranularity::PerTransition => FlowParameter::Unbalanced {
                            direction: Direction::IncomingFlow,
                            parameter: RateParameter::PerTransition { transition: mor.clone() },
                        },
                        RateGranularity::PerPlace => FlowParameter::Unbalanced {
                            direction: Direction::IncomingFlow,
                            parameter: RateParameter::PerPlace {
                                transition: mor.clone(),
                                place: output_place.clone(),
                            },
                        },
                    },
                };

                let name =
                    mor.clone().snoc(name_seg("ToOutput")).snoc(output_place.only().unwrap());

                associated_parameters.insert(name.clone(), parameter);
                ode_model.add_mor(name, term.clone(), output, ode_pos_cont_type.clone());
            }
        }

        // Finally, build the system using
        let sys = PolynomialODEAnalysis::default()
            .build_system_custom_parameters::<FlowParameter>(&ode_model, associated_parameters);
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
    ) -> PolynomialSystem<QualifiedName, Parameter<FlowParameter>, i8> {
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
                    let param = Parameter::generator(FlowParameter::Balanced { transition: flow });
                    let term: Polynomial<_, _, _> = [(param, term.clone())].into_iter().collect();
                    sys.add_term(dom, -term.clone());
                    sys.add_term(cod, term);
                }
                MassConservationType::Unbalanced(_) => {
                    let dom_param = Parameter::generator(FlowParameter::Unbalanced {
                        direction: Direction::OutgoingFlow,
                        parameter: RateParameter::PerTransition { transition: flow.clone() },
                    });
                    let cod_param = Parameter::generator(FlowParameter::Unbalanced {
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
    /// N.B. This is renamed to "rates" in catlog-wasm for backwards compatibility.
    #[cfg_attr(feature = "serde", serde(rename = "rates"))]
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

/// Substitutes numerical rate coefficients into a symbolic mass-action system.
pub fn extend_mass_action_scalars(
    sys: PolynomialSystem<QualifiedName, Parameter<FlowParameter>, i8>,
    data: &MassActionProblemData,
) -> PolynomialSystem<QualifiedName, f32, i8> {
    let sys = sys.extend_scalars(|poly| {
        poly.eval(|flow| match flow {
            FlowParameter::Balanced { transition } => {
                data.transition_rates.get(transition).cloned().unwrap_or_default()
            }
            FlowParameter::Unbalanced { direction, parameter } => match (direction, parameter) {
                (Direction::IncomingFlow, RateParameter::PerTransition { transition }) => {
                    data.transition_production_rates.get(transition).cloned().unwrap_or_default()
                }
                (Direction::OutgoingFlow, RateParameter::PerTransition { transition }) => {
                    data.transition_consumption_rates.get(transition).cloned().unwrap_or_default()
                }
                (Direction::IncomingFlow, RateParameter::PerPlace { transition, place }) => data
                    .place_production_rates
                    .get(transition)
                    .and_then(|rate| rate.get(place))
                    .copied()
                    .unwrap_or_default(),
                (Direction::OutgoingFlow, RateParameter::PerPlace { transition, place }) => data
                    .place_consumption_rates
                    .get(transition)
                    .and_then(|rate| rate.get(place))
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

    // Tests for stock-flow diagrams. These all use the backward_link() model,
    // which has a single flow x==f==>y and a single link y->f.

    #[test]
    fn balanced_stock_flow() {
        let th = Rc::new(th_category_links());
        let model = backward_link(th);
        let sys = StockFlowMassActionAnalysis::default()
            .build_system(&model, analyses::ode::MassConservationType::Balanced);
        let expected = expect!([r#"
            dx = -f x y
            dy = f x y
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn unbalanced_stock_flow() {
        let th = Rc::new(th_category_links());
        let model = backward_link(th);
        let sys = StockFlowMassActionAnalysis::default().build_system(
            &model,
            analyses::ode::MassConservationType::Unbalanced(
                analyses::ode::RateGranularity::PerTransition,
            ),
        );
        let expected = expect!([r#"
            dx = -Outgoing(f) x y
            dy = Incoming(f) x y
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    // Tests for signed stock-flow diagrams. These all use the negative_backwards_link()
    // model, which has a single flow x==f=>y and a single negative link y->f.

    #[test]
    fn balanced_signed_stock_flow() {
        let th = Rc::new(th_category_signed_links());
        let model = negative_backward_link(th);
        let sys = StockFlowMassActionAnalysis::default()
            .build_system(&model, analyses::ode::MassConservationType::Balanced);
        let expected = expect!([r#"
            dx = -f x y^{-1}
            dy = f x y^{-1}
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn unbalanced_signed_stock_flow() {
        let th = Rc::new(th_category_signed_links());
        let model = negative_backward_link(th);
        let sys = StockFlowMassActionAnalysis::default().build_system(
            &model,
            analyses::ode::MassConservationType::Unbalanced(
                analyses::ode::RateGranularity::PerTransition,
            ),
        );
        let expected = expect!([r#"
            dx = -Outgoing(f) x y^{-1}
            dy = Incoming(f) x y^{-1}
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    // Tests for Petri nets. These all use the catalyzed_reaction() model, which
    // has a single transition [x,c]-->f-->[y,c].

    #[test]
    fn balanced_petri() {
        let th = Rc::new(th_sym_monoidal_category());
        let model = catalyzed_reaction(th);
        let sys = PetriNetMassActionAnalysis::default()
            .build_system(&model, analyses::ode::MassConservationType::Balanced);
        let expected = expect!([r#"
            dx = -f c x
            dy = f c x
            dc = 0
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn unbalanced_petri_per_transition() {
        let th = Rc::new(th_sym_monoidal_category());
        let model = catalyzed_reaction(th);
        let sys = PetriNetMassActionAnalysis::default().build_system(
            &model,
            analyses::ode::MassConservationType::Unbalanced(
                analyses::ode::RateGranularity::PerTransition,
            ),
        );
        let expected = expect!([r#"
            dx = -Outgoing(f) c x
            dy = Incoming(f) c x
            dc = (Incoming(f) - Outgoing(f)) c x
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn unbalanced_petri_per_place() {
        let th = Rc::new(th_sym_monoidal_category());
        let model = catalyzed_reaction(th);
        let sys = PetriNetMassActionAnalysis::default().build_system(
            &model,
            analyses::ode::MassConservationType::Unbalanced(
                analyses::ode::RateGranularity::PerPlace,
            ),
        );
        let expected = expect!([r#"
            dx = -(x->[f]) c x
            dy = ([f]->y) c x
            dc = (([f]->c) - (c->[f])) c x
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    // Test for LaTeX.

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
                rhs: "-Outgoing(f) \\cdot x \\cdot y".to_string(),
            },
            LatexEquation {
                lhs: "\\frac{\\mathrm{d}}{\\mathrm{d}t} y".to_string(),
                rhs: "Incoming(f) \\cdot x \\cdot y".to_string(),
            },
        ];
        assert_eq!(expected, sys.to_latex_equations());
    }
}
