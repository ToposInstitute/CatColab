//! Mass-action ODE analysis of models.
//!
//! Such ODEs are based on the *law of mass action* familiar from chemistry and
//! mathematical epidemiology. Here, however, we also consider a generalised version
//! where we do not require that mass be preserved. This allows the construction
//! of systems of arbitrary polynomial (first-order) ODEs.

use std::{collections::HashMap, fmt};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::Parameter;
use crate::latex::{Latex, ToLatexWithMap};
use crate::simulate::ode::PolynomialSystem;
use crate::stdlib::analyses::ode::ode_semantics::*;
use crate::stdlib::analyses::petri::transition_interface;
use crate::stdlib::analyses::stock_flow::flow_interface;
use crate::zero::{QualifiedName, name};
use crate::{
    dbl::{
        model::{DiscreteTabModel, FpDblModel, ModalDblModel},
        theory::{ModalMorType, ModalObType, TabMorType, TabObType, Unital},
    },
    zero::name_seg,
};

/// Mass-action semantics for Petri nets.
pub struct PetriNetMassActionSemantics;
/// Mass-action semantics for stock-flow diagrams.
pub struct StockFlowMassActionSemantics;

impl ODESemantics for PetriNetMassActionSemantics {
    type ModelType = ModalDblModel<Unital>;
    type ParameterType = MassActionParameter;
    type AnalysisType = PetriNetMassActionAnalysis;
    type EquationsDataType = MassActionEquationsData;
    type ProblemDataType = MassActionProblemData;
}

impl ODESemantics for StockFlowMassActionSemantics {
    type ModelType = DiscreteTabModel;
    type ParameterType = MassActionParameter;
    type AnalysisType = StockFlowMassActionAnalysis;
    type EquationsDataType = MassActionEquationsData;
    type ProblemDataType = MassActionProblemData;
}

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
    /// Each flow (transition) gets assigned a single consumption and single production rate.
    PerTransition,

    /// Each flow (transition) gets assigned a consumption rate for each input stock (place) and
    /// a production rate for each output stock (place).
    PerPlace,
}

/// Now, corresponding to each term of `MassConvervationType`, we have different
/// terms for `MassActionParameter`. Parameters in the generated polynomial equations
/// are *undirected* in the balanced case and *directed* in the unbalanced case.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone)]
pub enum MassActionParameter {
    /// If mass is conserved, we don't need to worry whether a flow is incoming or outgoing.
    Balanced {
        /// Since there is no direction, the rate parameter corresponds to a single transition.
        flow: QualifiedName,
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
    /// For per flow rates, we simply need to know the associated flow.
    PerTransition {
        /// The flow to which we associate the rate parameter.
        flow: QualifiedName,
    },

    /// For per stock rates, we need to know both the transition and the corresponding
    /// input/output stock.
    PerPlace {
        /// The flow whose input/output objects we wish to associate rate parameters.
        flow: QualifiedName,
        /// The input/output stock to which we associate the rate parameter.
        stock: QualifiedName,
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

impl fmt::Display for MassActionParameter {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self {
            Self::Balanced { flow: trans } => {
                write!(f, "{}", trans)
            }
            Self::Unbalanced {
                direction: Direction::IncomingFlow,
                parameter: RateParameter::PerTransition { flow: trans },
            } => {
                write!(f, "Incoming({})", trans)
            }
            Self::Unbalanced {
                direction: Direction::IncomingFlow,
                parameter: RateParameter::PerPlace { flow: trans, stock: output },
            } => {
                write!(f, "([{}]->{})", trans, output)
            }
            Self::Unbalanced {
                direction: Direction::OutgoingFlow,
                parameter: RateParameter::PerTransition { flow: trans },
            } => {
                write!(f, "Outgoing({})", trans)
            }
            Self::Unbalanced {
                direction: Direction::OutgoingFlow,
                parameter: RateParameter::PerPlace { flow: trans, stock: input },
            } => {
                write!(f, "({}->[{}])", input, trans)
            }
        }
    }
}

impl ToLatexWithMap for MassActionParameter {
    fn to_latex_with_map<T: Fn(&QualifiedName) -> String>(&self, f: T) -> Latex {
        match self {
            MassActionParameter::Balanced { flow } => Latex(format!("r_{{{}}}", f(flow))),
            MassActionParameter::Unbalanced { direction, parameter } => {
                match (direction, parameter) {
                    (Direction::IncomingFlow, RateParameter::PerTransition { flow }) => {
                        Latex(format!("\\rho_{{{}}}", f(flow)))
                    }
                    (Direction::OutgoingFlow, RateParameter::PerTransition { flow }) => {
                        Latex(format!("\\kappa_{{{}}}", f(flow)))
                    }
                    (Direction::IncomingFlow, RateParameter::PerPlace { flow, stock }) => {
                        Latex(format!("\\rho_{{{}}}^{{{}}}", f(flow), f(stock)))
                    }
                    (Direction::OutgoingFlow, RateParameter::PerPlace { flow, stock }) => {
                        Latex(format!("\\kappa_{{{}}}^{{{}}}", f(flow), f(stock)))
                    }
                }
            }
        }
    }
}

impl ODEParameterType for MassActionParameter {}

/// Mass-action ODE analysis for Petri nets.
///
/// This struct implements the object part of the functorial semantics for reaction
/// networks (aka, Petri nets) due to [Baez & Pollard](crate::refs::ReactionNets).
pub struct PetriNetMassActionAnalysis {
    /// Object type for places.
    pub place_ob_type: ModalObType,
    /// Morphism type for transitions.
    pub transition_mor_type: ModalMorType,
    /// Mass-conservation type.
    pub mass_conservation_type: MassConservationType,
}

impl Default for PetriNetMassActionAnalysis {
    fn default() -> Self {
        let ob_type = ModalObType::new(name("Object"));
        Self {
            place_ob_type: ob_type.clone(),
            transition_mor_type: ModalMorType::Zero(ob_type),
            mass_conservation_type: MassConservationType::Balanced,
        }
    }
}

impl
    ODESemanticsAnalysis<
        <PetriNetMassActionSemantics as ODESemantics>::ModelType,
        <PetriNetMassActionSemantics as ODESemantics>::ParameterType,
    > for PetriNetMassActionAnalysis
{
    fn build_system_builder(
        &self,
        model: &<PetriNetMassActionSemantics as ODESemantics>::ModelType,
    ) -> PolynomialODESystemBuilder<<PetriNetMassActionSemantics as ODESemantics>::ParameterType>
    {
        let mut builder = PolynomialODESystemBuilder::new();

        for place in model.ob_generators_with_type(&self.place_ob_type) {
            // For each place, we create a variable.
            builder.add_variable(place.clone());
        }

        for transition in model.mor_generators_with_type(&self.transition_mor_type) {
            let interface = transition_interface(model, &transition);
            let (inputs, outputs) =
                (interface.input_places.clone(), interface.output_places.clone());

            // Each transition gives a positive contribution to each term corresponding to
            // one of its outputs, and a negative contribution to each term corresponding to
            // one of its inputs. For example, a single transition T: [a,b] -> [x,y] will give
            // four contributions, namely two positive contributions (ab -> x , ab -> y)
            // and two negative (ab -> a , ab -> b).

            for output in outputs.clone() {
                let id = output.cons(name_seg("ToOutput")).cons(transition.only().unwrap());
                // The transition
                //   T : [x_1, ..., x_n] -> [y_1, ..., y_n]
                // becomes the contributions
                //   \dot{y_i} += Parameter_! \cdot x_1...x_n
                // where Parameter_! depends on `mass_conservation_type`:
                //   Balanced                  => Parameter_T
                //   Unbalanced::PerTransition => Parameter_T^inflow
                //   Unbalanced::PerPlace      => Parameter_{T,y_i}^inflow
                let parameter = match self.mass_conservation_type {
                    MassConservationType::Balanced => {
                        MassActionParameter::Balanced { flow: transition.clone() }
                    }
                    MassConservationType::Unbalanced(granularity) => match granularity {
                        RateGranularity::PerTransition => MassActionParameter::Unbalanced {
                            direction: Direction::IncomingFlow,
                            parameter: RateParameter::PerTransition { flow: transition.clone() },
                        },
                        RateGranularity::PerPlace => MassActionParameter::Unbalanced {
                            direction: Direction::IncomingFlow,
                            parameter: RateParameter::PerPlace {
                                flow: transition.clone(),
                                stock: output.clone(),
                            },
                        },
                    },
                };

                builder.add_contribution(
                    id,
                    output,
                    ContributionSign::Positive,
                    parameter,
                    inputs.clone(),
                );
            }

            for input in inputs.clone() {
                let id = input.cons(name_seg("ToInput")).cons(transition.only().unwrap());
                // The transition
                //   T : [x_1, ..., x_n] -> [y_1, ..., y_n]
                // becomes the contributions
                //   \dot{x_i} -= Parameter_! \cdot x_1...x_n
                // where Parameter_! depends on `mass_conservation_type`:
                //   Balanced             => Parameter_T
                //   Unbalanced::PerTransition  => Parameter_T^outflow
                //   Unbalanced::PerPlace => Parameter_{T,x_i}^outflow
                let parameter = match self.mass_conservation_type {
                    MassConservationType::Balanced => {
                        MassActionParameter::Balanced { flow: transition.clone() }
                    }
                    MassConservationType::Unbalanced(granularity) => match granularity {
                        RateGranularity::PerTransition => MassActionParameter::Unbalanced {
                            direction: Direction::OutgoingFlow,
                            parameter: RateParameter::PerTransition { flow: transition.clone() },
                        },
                        RateGranularity::PerPlace => MassActionParameter::Unbalanced {
                            direction: Direction::OutgoingFlow,
                            parameter: RateParameter::PerPlace {
                                flow: transition.clone(),
                                stock: input.clone(),
                            },
                        },
                    },
                };

                builder.add_contribution(
                    id,
                    input,
                    ContributionSign::Negative,
                    parameter,
                    inputs.clone(),
                );
            }
        }

        builder
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
    /// Mass-conservation type.
    pub mass_conservation_type: MassConservationType,
}

impl Default for StockFlowMassActionAnalysis {
    fn default() -> Self {
        let ob_type = TabObType::Basic(name("Object"));
        Self {
            stock_ob_type: ob_type.clone(),
            flow_mor_type: TabMorType::Hom(Box::new(ob_type.clone())),
            pos_link_mor_type: TabMorType::Basic(name("Link")),
            neg_link_mor_type: TabMorType::Basic(name("NegativeLink")),
            mass_conservation_type: MassConservationType::Balanced,
        }
    }
}

impl
    ODESemanticsAnalysis<
        <StockFlowMassActionSemantics as ODESemantics>::ModelType,
        <StockFlowMassActionSemantics as ODESemantics>::ParameterType,
    > for StockFlowMassActionAnalysis
{
    fn build_system_builder(
        &self,
        model: &<StockFlowMassActionSemantics as ODESemantics>::ModelType,
    ) -> PolynomialODESystemBuilder<<StockFlowMassActionSemantics as ODESemantics>::ParameterType>
    {
        let mut builder = PolynomialODESystemBuilder::new();

        for stock in model.ob_generators_with_type(&self.stock_ob_type) {
            // For each stock, we create a variable.
            builder.add_variable(stock.clone());
        }

        for flow in model.mor_generators_with_type(&self.flow_mor_type) {
            let interface = flow_interface(model, &flow);
            let (input, output) = (interface.input_stock, interface.output_stock);

            // Each flow gives a positive contribution to the term corresponding to its output, and
            // a negative contribution to the term corresponding to its input; the term is given by
            // the product of the input with the sources of all incoming links.
            let monomial = [interface.input_pos_link_doms, vec![input.clone()]].concat();

            // The flow
            //   F : a -> b
            // with links
            //   l_i : x_i -> F
            // becomes the contributions
            //   \dot{b} += Parameter_! \cdot a x_1.. x_n
            //   \dot{a} -= Parameter_? \cdot a x_1.. x_n
            // where Parameter_! and Parameter_? depend on `mass_conservation_type`:
            //   Balanced            => Parameter_! = Parameter_F
            //                          Parameter_? = Parameter_F
            //   Unbalanced::PerTransition => Parameter_! = Parameter_F^inflow
            //                          Parameter_? = Parameter_F^outflow

            let output_id = output.cons(name_seg("ToOutput")).cons(flow.only().unwrap());
            let output_parameter = match self.mass_conservation_type {
                MassConservationType::Balanced => {
                    MassActionParameter::Balanced { flow: flow.clone() }
                }
                MassConservationType::Unbalanced(_) => MassActionParameter::Unbalanced {
                    direction: Direction::IncomingFlow,
                    parameter: RateParameter::PerTransition { flow: flow.clone() },
                },
            };
            builder.add_contribution(
                output_id,
                output.clone(),
                ContributionSign::Positive,
                output_parameter,
                monomial.clone(),
            );

            let input_id = input.cons(name_seg("ToInput")).cons(flow.only().unwrap());
            let input_parameter = match self.mass_conservation_type {
                MassConservationType::Balanced => {
                    MassActionParameter::Balanced { flow: flow.clone() }
                }
                MassConservationType::Unbalanced(_) => MassActionParameter::Unbalanced {
                    direction: Direction::OutgoingFlow,
                    parameter: RateParameter::PerTransition { flow: flow.clone() },
                },
            };
            builder.add_contribution(
                input_id,
                input.clone(),
                ContributionSign::Negative,
                input_parameter,
                monomial,
            );
        }

        builder
    }
}

/// Data defining mass-action ODE equations for a model.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
#[derive(Clone)]
pub struct MassActionEquationsData {
    /// Whether or not mass is conserved.
    #[cfg_attr(feature = "serde", serde(rename = "massConservationType"))]
    pub mass_conservation_type: MassConservationType,
}

impl Default for MassActionEquationsData {
    fn default() -> Self {
        Self {
            mass_conservation_type: MassConservationType::Balanced,
        }
    }
}

impl ODESemanticsEquationsData for MassActionEquationsData {}

/// Data defining a mass-action ODE problem for a model.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct MassActionProblemData {
    /// Data used for generating the equations (namely, whether or not mass is conserved).
    #[cfg_attr(feature = "serde", serde(rename = "equationsData"))]
    pub equations_data: MassActionEquationsData,

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

impl ODESemanticsProblemData<MassActionParameter> for MassActionProblemData {
    fn equations_data(&self) -> impl ODESemanticsEquationsData {
        self.equations_data.clone()
    }

    fn initial_values(&self) -> HashMap<QualifiedName, f32> {
        self.initial_values.clone()
    }

    fn duration(&self) -> f32 {
        self.duration
    }

    fn extend_scalars(
        &self,
        sys: PolynomialSystem<QualifiedName, Parameter<MassActionParameter>, i8>,
    ) -> PolynomialSystem<QualifiedName, f32, i8> {
        let sys = sys.extend_scalars(|poly| {
            poly.eval(|flow| match flow {
                MassActionParameter::Balanced { flow: transition } => {
                    self.transition_rates.get(transition).cloned().unwrap_or_default()
                }
                MassActionParameter::Unbalanced { direction, parameter } => {
                    match (direction, parameter) {
                        (
                            Direction::IncomingFlow,
                            RateParameter::PerTransition { flow: transition },
                        ) => self
                            .transition_production_rates
                            .get(transition)
                            .cloned()
                            .unwrap_or_default(),
                        (
                            Direction::OutgoingFlow,
                            RateParameter::PerTransition { flow: transition },
                        ) => self
                            .transition_consumption_rates
                            .get(transition)
                            .cloned()
                            .unwrap_or_default(),
                        (
                            Direction::IncomingFlow,
                            RateParameter::PerPlace { flow: transition, stock: place },
                        ) => self
                            .place_production_rates
                            .get(transition)
                            .and_then(|rate| rate.get(place))
                            .copied()
                            .unwrap_or_default(),
                        (
                            Direction::OutgoingFlow,
                            RateParameter::PerPlace { flow: transition, stock: place },
                        ) => self
                            .place_consumption_rates
                            .get(transition)
                            .and_then(|rate| rate.get(place))
                            .copied()
                            .unwrap_or_default(),
                    }
                }
            })
        });

        sys.normalize()
    }
}

#[cfg(test)]
mod tests {
    use expect_test::expect;
    use std::rc::Rc;

    use super::*;
    use crate::{
        latex::{LatexEquation, LatexEquations},
        stdlib::{analyses, models::*, theories::*},
    };

    // Tests for stock-flow diagrams. These all use the backward_link() model,
    // which has a single flow x==f==>y and a single link y->f.

    #[test]
    fn balanced_stock_flow() {
        let th = Rc::new(th_category_links());
        let model = backward_link(th);
        let sys = StockFlowMassActionAnalysis::default().build_system(&model);
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
        let sys = StockFlowMassActionAnalysis {
            mass_conservation_type: analyses::ode::MassConservationType::Unbalanced(
                analyses::ode::RateGranularity::PerTransition,
            ),
            ..StockFlowMassActionAnalysis::default()
        }
        .build_system(&model);
        let expected = expect!([r#"
            dx = -Outgoing(f) x y
            dy = Incoming(f) x y
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    // Tests for Petri nets. These all use the catalyzed_reaction() model, which
    // has a single transition [x,c]-->f-->[y,c].

    #[test]
    fn balanced_petri() {
        let th = Rc::new(th_sym_monoidal_category());
        let model = catalyzed_reaction(th);
        let sys = PetriNetMassActionAnalysis::default().build_system(&model);
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
        let sys = PetriNetMassActionAnalysis {
            mass_conservation_type: analyses::ode::MassConservationType::Unbalanced(
                analyses::ode::RateGranularity::PerTransition,
            ),
            ..PetriNetMassActionAnalysis::default()
        }
        .build_system(&model);
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
        let sys = PetriNetMassActionAnalysis {
            mass_conservation_type: analyses::ode::MassConservationType::Unbalanced(
                analyses::ode::RateGranularity::PerPlace,
            ),
            ..PetriNetMassActionAnalysis::default()
        }
        .build_system(&model);
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
        let sys = StockFlowMassActionAnalysis {
            mass_conservation_type: analyses::ode::MassConservationType::Unbalanced(
                analyses::ode::RateGranularity::PerTransition,
            ),
            ..StockFlowMassActionAnalysis::default()
        }
        .build_system(&model);
        let expected = LatexEquations(vec![
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} x".to_string()),
                rhs: Latex("-\\kappa_{f} \\cdot x \\cdot y".to_string()),
            },
            LatexEquation {
                lhs: Latex("\\frac{\\mathrm{d}}{\\mathrm{d}t} y".to_string()),
                rhs: Latex("\\rho_{f} \\cdot x \\cdot y".to_string()),
            },
        ]);
        assert_eq!(expected, sys.to_latex_equations());
    }
}
