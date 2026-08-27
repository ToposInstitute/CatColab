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

use crate::latex::{Latex, ToLatexWithMap};
use crate::simulate::ode::PolynomialSystem;
use crate::stdlib::analyses::v0::petri::transition_interface;
use crate::stdlib::analyses::v0::stock_flow::flow_interface;
use crate::stdlib::analyses::v1::ode::Parameter;
use crate::stdlib::analyses::v1::ode::ode_semantics::*;
use crate::zero::{QualifiedName, name};
use crate::{
    dbl::{
        model::{DiscreteTabModel, FpDblModel, ModalDblModel},
        theory::{ModalMorType, ModalObType, TabMorType, TabObType, Unital},
    },
    zero::name_seg,
};

// Because Petri nets and stock-flow diagrams are different types of models (unital modal and
// discrete tabulator, respectively), we need a different structs for each one, since to implement
// `ODESemantics` we need to specify a `ModelType`. In particular, they will need different
// implementations of `ODESemanticsAnalysis::build_system_builder`. Furthermore, we implement the
// corresponding "unbalanced" semantics for each. For "ease", we do all of these in this same file.
// For convenience, we briefly summarise here how these variations of mass-action are constructed.
//
// For Petri nets, each transition gives a positive contribution to each term corresponding to one
// of its outputs, and a negative contribution to each term corresponding to one of its inputs. For
// example, a single transition T: [a,b] -> [x,y] will give four contributions, namely
//
// - two positive contributions:
//      (ab -> x , ab -> y)
//
// - two negative contributions:
//      (ab -> a , ab -> b).
//
// The variations of mass-action determine the coefficients of these contributions:
//
// - In the *balanced* (i.e. classical) case, all four contributions will have the same coefficient.
//
// - In the *unbalanced* (per-transition) case, the two positive contributions will have the same
//   coefficient (the "production rate" of the transition) and the two negative contributions will
//   have the same coefficient (the "consumption rate" of the transition).
//
// - In the *per-place* case, the production (resp. consumption) rates from the unbalanced case are
//   now potentially distinct, i.e. each coefficient depends on a *pair* (transition, place).
//
// For stock-flow diagrams, each flow gives a positive contribution to the term corresponding to its
// output, and a negative contribution to the term corresponding to its input; the term is given by
// the product of the input with the sources of all incoming links. The balanced and unbalanced
// cases are analogous to those for Petri nets (by thinking of a flow as a single-input and
// single-output transition).

// ┌-----------------------┐
// | A. BALANCED SEMANTICS |
// └-----------------------┘
// We start with the usual mass-action semantics, for both Petri nets and stock-flow diagrams.

/// Mass-action semantics for Petri nets.
pub struct PetriNetBalancedMassActionSemantics;
impl ODESemantics for PetriNetBalancedMassActionSemantics {
    type ModelType = ModalDblModel<Unital>;
    type ParameterType = BalancedMassActionParameter;
    type AnalysisType = PetriNetBalancedMassActionAnalysis;
    type ParameterData = BalancedMassActionParameterData;
}

/// Mass-action semantics for stock-flow diagrams.
pub struct StockFlowBalancedMassActionSemantics;
impl ODESemantics for StockFlowBalancedMassActionSemantics {
    type ModelType = DiscreteTabModel;
    type ParameterType = BalancedMassActionParameter;
    type AnalysisType = StockFlowBalancedMassActionAnalysis;
    type ParameterData = BalancedMassActionParameterData;
}

// ┌--------------------┐
// | A.1. ParameterType |
// └--------------------┘

/// Parameters for the usual ("balanced") mass-action semantics, where each transition has a rate.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone)]
pub enum BalancedMassActionParameter {
    /// The rate of a transition.
    Rate {
        /// The transition in question.
        transition: QualifiedName,
    },
}

impl fmt::Display for BalancedMassActionParameter {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            BalancedMassActionParameter::Rate { transition } => write!(f, "Rate({})", transition),
        }
    }
}

impl ToLatexWithMap for BalancedMassActionParameter {
    fn to_latex_with_map<T: Fn(&QualifiedName) -> String>(&self, f: T) -> Latex {
        match self {
            BalancedMassActionParameter::Rate { transition } => {
                Latex(format!("r_{{{}}}", f(transition)))
            }
        }
    }
}

impl ODEParameterType for BalancedMassActionParameter {}

// ┌-------------------┐
// | A.2. AnalysisType |
// └-------------------┘

/// Mass-action ODE analysis for Petri nets.
///
/// This struct implements the object part of the functorial semantics for reaction
/// networks (aka, Petri nets) due to [Baez & Pollard](crate::refs::ReactionNets).
pub struct PetriNetBalancedMassActionAnalysis {
    /// Object type for places.
    pub place_ob_type: ModalObType,
    /// Morphism type for transitions.
    pub transition_mor_type: ModalMorType,
}

impl Default for PetriNetBalancedMassActionAnalysis {
    fn default() -> Self {
        let ob_type = ModalObType::new(name("Object"));
        Self {
            place_ob_type: ob_type.clone(),
            transition_mor_type: ModalMorType::Zero(ob_type),
        }
    }
}

impl
    ODESemanticsAnalysis<
        <PetriNetBalancedMassActionSemantics as ODESemantics>::ModelType,
        <PetriNetBalancedMassActionSemantics as ODESemantics>::ParameterType,
    > for PetriNetBalancedMassActionAnalysis
{
    fn build_system_builder(
        &self,
        model: &ModalDblModel<Unital>,
    ) -> PolynomialODESystemBuilder<BalancedMassActionParameter> {
        let mut builder = PolynomialODESystemBuilder::new();

        // For each place, we create a variable.
        for place in model.ob_generators_with_type(&self.place_ob_type) {
            builder.add_variable(place.clone());
        }

        // Each transition
        //      T : [x_1, ..., x_n] -> [y_1, ..., y_n]
        // gives rise to the contributions
        //      d/dt(x_i) -= Rate(T) x_1 ... x_n
        //      d/dt(y_i) += Rate(T) x_1 ... x_n.
        for transition in model.mor_generators_with_type(&self.transition_mor_type) {
            let interface = transition_interface(model, &transition);
            let (inputs, outputs) =
                (interface.input_places.clone(), interface.output_places.clone());

            let parameter = BalancedMassActionParameter::Rate { transition: transition.clone() };

            for output in outputs.clone() {
                let id = output.cons(name_seg("ToOutput")).cons(transition.only().unwrap());
                builder.add_contribution(
                    id,
                    output,
                    ContributionSign::Positive,
                    parameter.clone(),
                    inputs.clone(),
                );
            }

            for input in inputs.clone() {
                let id = input.cons(name_seg("FromInput")).cons(transition.only().unwrap());
                builder.add_contribution(
                    id,
                    input,
                    ContributionSign::Negative,
                    parameter.clone(),
                    inputs.clone(),
                );
            }
        }

        builder
    }
}

/// Mass-action ODE analysis for stock-flow models.
pub struct StockFlowBalancedMassActionAnalysis {
    /// Object type for stocks.
    pub stock_ob_type: TabObType,
    /// Morphism type for flows between stocks.
    pub flow_mor_type: TabMorType,
    /// Morphism type for positive links from stocks to flows.
    pub pos_link_mor_type: TabMorType,
    /// Morphism type for negative links from stocks to flows.
    pub neg_link_mor_type: TabMorType,
}

impl Default for StockFlowBalancedMassActionAnalysis {
    fn default() -> Self {
        let ob_type = TabObType::Basic(name("Object"));
        Self {
            stock_ob_type: ob_type.clone(),
            flow_mor_type: TabMorType::Hom(Box::new(ob_type.clone())),
            pos_link_mor_type: TabMorType::Basic(name("Link")),
            neg_link_mor_type: TabMorType::Basic(name("NegativeLink")),
        }
    }
}

impl
    ODESemanticsAnalysis<
        <StockFlowBalancedMassActionSemantics as ODESemantics>::ModelType,
        <StockFlowBalancedMassActionSemantics as ODESemantics>::ParameterType,
    > for StockFlowBalancedMassActionAnalysis
{
    fn build_system_builder(
        &self,
        model: &DiscreteTabModel,
    ) -> PolynomialODESystemBuilder<BalancedMassActionParameter> {
        let mut builder = PolynomialODESystemBuilder::new();

        // For each stock, we create a variable.
        for stock in model.ob_generators_with_type(&self.stock_ob_type) {
            builder.add_variable(stock.clone());
        }

        // The flow
        //      F : x -> y
        // with links
        //      l_i : a_i -> F
        // gives rise to the contributions
        //      d/dt(x) -= Rate(F) x a_1 ... a_n
        //      d/dt(y) += Rate(F) x a_1 ... a_n
        for flow in model.mor_generators_with_type(&self.flow_mor_type) {
            let interface = flow_interface(model, &flow);
            let (input, output) = (interface.input_stock, interface.output_stock);

            let parameter = BalancedMassActionParameter::Rate { transition: flow.clone() };
            let monomial = [interface.input_pos_link_doms, vec![input.clone()]].concat();

            let output_id = output.cons(name_seg("ToOutput")).cons(flow.only().unwrap());
            builder.add_contribution(
                output_id,
                output,
                ContributionSign::Positive,
                parameter.clone(),
                monomial.clone(),
            );

            let input_id = input.cons(name_seg("ToInput")).cons(flow.only().unwrap());
            builder.add_contribution(
                input_id,
                input,
                ContributionSign::Negative,
                parameter,
                monomial,
            );
        }

        builder
    }
}

// ┌--------------------┐
// | A.3. ParameterData |
// └--------------------┘

/// Data input by the user to fill in the parameters numerically.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
#[derive(Clone)]
pub struct BalancedMassActionParameterData {
    /// Map from morphism IDs to consumption rate coefficients (non-negative reals).
    pub(crate) rates: HashMap<QualifiedName, f32>,
}

impl ODESemanticsScalarExtension<BalancedMassActionParameter> for BalancedMassActionParameterData {
    fn extend_scalars(
        &self,
        sys: PolynomialSystem<QualifiedName, Parameter<BalancedMassActionParameter>, i8>,
    ) -> PolynomialSystem<QualifiedName, f32, i8> {
        let sys = sys.extend_scalars(|poly| {
            poly.eval(|parameter| match parameter {
                BalancedMassActionParameter::Rate { transition } => {
                    self.rates.get(transition).cloned().unwrap_or_default()
                }
            })
        });

        sys.normalize()
    }
}

/// Data for a numerical balanced mass-action system.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
#[derive(Clone)]
pub struct BalancedMassActionProblemData {
    /// Data common to all ODE problems.
    #[cfg_attr(feature = "serde", serde(rename = "generalData"))]
    pub general_data: ODESemanticsGeneralProblemData,
    /// Data specific to balanced mass-action problems.
    #[cfg_attr(feature = "serde", serde(rename = "parameterData"))]
    pub parameter_data: BalancedMassActionParameterData,
}

impl ODESemanticsProblemData<PetriNetBalancedMassActionSemantics>
    for BalancedMassActionProblemData
{
    type ParameterData = BalancedMassActionParameterData;
    fn general_data(self) -> ODESemanticsGeneralProblemData {
        self.general_data
    }
    fn parameter_data(self) -> Self::ParameterData {
        self.parameter_data
    }
}

impl ODESemanticsProblemData<StockFlowBalancedMassActionSemantics>
    for BalancedMassActionProblemData
{
    type ParameterData = BalancedMassActionParameterData;
    fn general_data(self) -> ODESemanticsGeneralProblemData {
        self.general_data
    }
    fn parameter_data(self) -> Self::ParameterData {
        self.parameter_data
    }
}

// ┌-------------------------┐
// | B. UNBALANCED SEMANTICS |
// └-------------------------┘

// ┌--------------------┐
// | B.1. ParameterType |
// └--------------------┘

/// Unbalanced ("per-transition") mass-action semantics for Petri nets.
pub struct PetriNetUnbalancedMassActionSemantics;
impl ODESemantics for PetriNetUnbalancedMassActionSemantics {
    type ModelType = ModalDblModel<Unital>;
    type ParameterType = UnbalancedMassActionParameter;
    type AnalysisType = PetriNetUnbalancedMassActionAnalysis;
    type ParameterData = UnbalancedMassActionParameterData;
}

/// Unbalanced ("per-flow") mass-action semantics for stock-flow diagrams.
pub struct StockFlowUnbalancedMassActionSemantics;
impl ODESemantics for StockFlowUnbalancedMassActionSemantics {
    type ModelType = DiscreteTabModel;
    type ParameterType = UnbalancedMassActionParameter;
    type AnalysisType = StockFlowUnbalancedMassActionAnalysis;
    type ParameterData = UnbalancedMassActionParameterData;
}

/// Parameters for unbalanced ("per-transition") mass-action semantics, where each transition has
/// two associated rates: its *consumption* (affecting its inputs) and its *production* (affecting
/// its outputs).
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone)]
pub enum UnbalancedMassActionParameter {
    /// The consumption parameter associated to all inputs to a transition.
    Consumption {
        /// The transition in question.
        transition: QualifiedName,
    },
    /// The production parameter associated to all inputs to a transition.
    Production {
        /// The transition in question.
        transition: QualifiedName,
    },
}

impl fmt::Display for UnbalancedMassActionParameter {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            UnbalancedMassActionParameter::Consumption { transition } => {
                write!(f, "Consumption({})", transition)
            }
            UnbalancedMassActionParameter::Production { transition } => {
                write!(f, "Production({})", transition)
            }
        }
    }
}

impl ToLatexWithMap for UnbalancedMassActionParameter {
    fn to_latex_with_map<T: Fn(&QualifiedName) -> String>(&self, f: T) -> Latex {
        match self {
            UnbalancedMassActionParameter::Consumption { transition } => {
                Latex(format!("\\kappa_{{{}}}", f(transition)))
            }
            UnbalancedMassActionParameter::Production { transition } => {
                Latex(format!("\\rho_{{{}}}", f(transition)))
            }
        }
    }
}

impl ODEParameterType for UnbalancedMassActionParameter {}

// ┌-------------------┐
// | B.2. AnalysisType |
// └-------------------┘

/// Unbalanced ("per-transition") mass-action ODE analysis for Petri nets.
pub struct PetriNetUnbalancedMassActionAnalysis {
    /// Object type for places.
    pub place_ob_type: ModalObType,
    /// Morphism type for transitions.
    pub transition_mor_type: ModalMorType,
}

impl Default for PetriNetUnbalancedMassActionAnalysis {
    fn default() -> Self {
        let ob_type = ModalObType::new(name("Object"));
        Self {
            place_ob_type: ob_type.clone(),
            transition_mor_type: ModalMorType::Zero(ob_type),
        }
    }
}

impl
    ODESemanticsAnalysis<
        <PetriNetUnbalancedMassActionSemantics as ODESemantics>::ModelType,
        <PetriNetUnbalancedMassActionSemantics as ODESemantics>::ParameterType,
    > for PetriNetUnbalancedMassActionAnalysis
{
    fn build_system_builder(
        &self,
        model: &ModalDblModel<Unital>,
    ) -> PolynomialODESystemBuilder<UnbalancedMassActionParameter> {
        let mut builder = PolynomialODESystemBuilder::new();

        // For each place, we create a variable.
        for place in model.ob_generators_with_type(&self.place_ob_type) {
            builder.add_variable(place.clone());
        }

        // Each transition
        //      T : [x_1, ..., x_n] -> [y_1, ..., y_n]
        // gives rise to the contributions
        //      d/dt(x_i) -= Consumption(T) x_1 ... x_n
        //      d/dt(y_i) += Production(T) x_1 ... x_n.
        for transition in model.mor_generators_with_type(&self.transition_mor_type) {
            let interface = transition_interface(model, &transition);
            let (inputs, outputs) =
                (interface.input_places.clone(), interface.output_places.clone());

            for output in outputs.clone() {
                let id = output.cons(name_seg("ToOutput")).cons(transition.only().unwrap());
                let output_parameter =
                    UnbalancedMassActionParameter::Production { transition: transition.clone() };
                builder.add_contribution(
                    id,
                    output,
                    ContributionSign::Positive,
                    output_parameter,
                    inputs.clone(),
                );
            }

            for input in inputs.clone() {
                let id = input.cons(name_seg("FromInput")).cons(transition.only().unwrap());
                let input_parameter =
                    UnbalancedMassActionParameter::Consumption { transition: transition.clone() };
                builder.add_contribution(
                    id,
                    input,
                    ContributionSign::Negative,
                    input_parameter.clone(),
                    inputs.clone(),
                );
            }
        }

        builder
    }
}

/// Unbalanced ("per-flow") mass-action ODE analysis for stock-flow models.
pub struct StockFlowUnbalancedMassActionAnalysis {
    /// Object type for stocks.
    pub stock_ob_type: TabObType,
    /// Morphism type for flows between stocks.
    pub flow_mor_type: TabMorType,
    /// Morphism type for positive links from stocks to flows.
    pub link_mor_type: TabMorType,
}

impl Default for StockFlowUnbalancedMassActionAnalysis {
    fn default() -> Self {
        let ob_type = TabObType::Basic(name("Object"));
        Self {
            stock_ob_type: ob_type.clone(),
            flow_mor_type: TabMorType::Hom(Box::new(ob_type.clone())),
            link_mor_type: TabMorType::Basic(name("Link")),
        }
    }
}

impl
    ODESemanticsAnalysis<
        <StockFlowUnbalancedMassActionSemantics as ODESemantics>::ModelType,
        <StockFlowUnbalancedMassActionSemantics as ODESemantics>::ParameterType,
    > for StockFlowUnbalancedMassActionAnalysis
{
    fn build_system_builder(
        &self,
        model: &DiscreteTabModel,
    ) -> PolynomialODESystemBuilder<UnbalancedMassActionParameter> {
        let mut builder = PolynomialODESystemBuilder::new();

        // For each stock, we create a variable.
        for stock in model.ob_generators_with_type(&self.stock_ob_type) {
            builder.add_variable(stock.clone());
        }

        // The flow
        //      F : x -> y
        // with links
        //      l_i : a_i -> F
        // gives rise to the contributions
        //      d/dt(x) -= Consumption(F) x a_1 ... a_n
        //      d/dt(y) += Production(F) x a_1 ... a_n
        for flow in model.mor_generators_with_type(&self.flow_mor_type) {
            let interface = flow_interface(model, &flow);
            let (input, output) = (interface.input_stock, interface.output_stock);

            let monomial = [interface.input_pos_link_doms, vec![input.clone()]].concat();

            let output_id = output.cons(name_seg("ToOutput")).cons(flow.only().unwrap());
            let output_parameter =
                UnbalancedMassActionParameter::Production { transition: flow.clone() };
            builder.add_contribution(
                output_id,
                output,
                ContributionSign::Positive,
                output_parameter,
                monomial.clone(),
            );

            let input_id = input.cons(name_seg("ToInput")).cons(flow.only().unwrap());
            let input_parameter =
                UnbalancedMassActionParameter::Consumption { transition: flow.clone() };
            builder.add_contribution(
                input_id,
                input,
                ContributionSign::Negative,
                input_parameter,
                monomial,
            );
        }

        builder
    }
}

// ┌--------------------┐
// | B.3. ParameterData |
// └--------------------┘

/// Data input by the user to fill in the parameters numerically.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
#[derive(Clone)]
pub struct UnbalancedMassActionParameterData {
    /// Map from morphism IDs to consumption rate coefficients (non-negative reals).
    #[cfg_attr(feature = "serde", serde(rename = "consumptionRates"))]
    pub(crate) consumption_rates: HashMap<QualifiedName, f32>,

    /// Map from morphism IDs to production rate coefficients (non-negative reals).
    #[cfg_attr(feature = "serde", serde(rename = "productionRates"))]
    pub(crate) production_rates: HashMap<QualifiedName, f32>,
}

impl ODESemanticsScalarExtension<UnbalancedMassActionParameter>
    for UnbalancedMassActionParameterData
{
    fn extend_scalars(
        &self,
        sys: PolynomialSystem<QualifiedName, Parameter<UnbalancedMassActionParameter>, i8>,
    ) -> PolynomialSystem<QualifiedName, f32, i8> {
        let sys = sys.extend_scalars(|poly| {
            poly.eval(|parameter| match parameter {
                UnbalancedMassActionParameter::Consumption { transition } => {
                    self.consumption_rates.get(transition).cloned().unwrap_or_default()
                }
                UnbalancedMassActionParameter::Production { transition } => {
                    self.production_rates.get(transition).cloned().unwrap_or_default()
                }
            })
        });

        sys.normalize()
    }
}

/// Data for a numerical unbalanced mass-action system.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
#[derive(Clone)]
pub struct UnbalancedMassActionProblemData {
    /// Data common to all ODE problems.
    #[cfg_attr(feature = "serde", serde(rename = "generalData"))]
    pub general_data: ODESemanticsGeneralProblemData,
    /// Data specific to unbalanced mass-action problems.
    #[cfg_attr(feature = "serde", serde(rename = "parameterData"))]
    pub parameter_data: UnbalancedMassActionParameterData,
}

impl ODESemanticsProblemData<PetriNetUnbalancedMassActionSemantics>
    for UnbalancedMassActionProblemData
{
    type ParameterData = UnbalancedMassActionParameterData;
    fn general_data(self) -> ODESemanticsGeneralProblemData {
        self.general_data
    }
    fn parameter_data(self) -> Self::ParameterData {
        self.parameter_data
    }
}

impl ODESemanticsProblemData<StockFlowUnbalancedMassActionSemantics>
    for UnbalancedMassActionProblemData
{
    type ParameterData = UnbalancedMassActionParameterData;
    fn general_data(self) -> ODESemanticsGeneralProblemData {
        self.general_data
    }
    fn parameter_data(self) -> Self::ParameterData {
        self.parameter_data
    }
}

// ┌------------------------┐
// | C. PER-PLACE SEMANTICS |
// └------------------------┘

/// Per-place mass-action semantics for Petri nets.
pub struct PetriNetPerPlaceMassActionSemantics;
impl ODESemantics for PetriNetPerPlaceMassActionSemantics {
    type ModelType = ModalDblModel<Unital>;
    type ParameterType = PerPlaceMassActionParameter;
    type AnalysisType = PetriNetPerPlaceMassActionAnalysis;
    type ParameterData = PerPlaceMassActionParameterData;
}

// ┌--------------------┐
// | C.1. ParameterType |
// └--------------------┘

/// Parameters for per-place mass-action semantics, where each transition has
/// individual consumption (resp. production) rates for each of its input (resp. output) stock. Note
/// that this only makes sense for Petri nets, not stock-flow diagrams.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone)]
pub enum PerPlaceMassActionParameter {
    /// The consumption parameter associated to a specific input stock to a transition.
    Consumption {
        /// The transition in question.
        transition: QualifiedName,
        /// The input stock in question.
        input_place: QualifiedName,
    },
    /// The production parameter associated to a specific output stock to a transition.
    Production {
        /// The transition in question.
        transition: QualifiedName,
        /// The output stock.
        output_place: QualifiedName,
    },
}

impl fmt::Display for PerPlaceMassActionParameter {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PerPlaceMassActionParameter::Consumption { transition, input_place } => {
                write!(f, "Consumption([{}] <- {})", transition, input_place)
            }
            PerPlaceMassActionParameter::Production { transition, output_place } => {
                write!(f, "Production([{}] -> {})", transition, output_place)
            }
        }
    }
}

impl ToLatexWithMap for PerPlaceMassActionParameter {
    fn to_latex_with_map<T: Fn(&QualifiedName) -> String>(&self, f: T) -> Latex {
        match self {
            PerPlaceMassActionParameter::Consumption { transition, input_place } => {
                Latex(format!("\\kappa_{{{}}}^{{{}}}", f(transition), f(input_place)))
            }
            PerPlaceMassActionParameter::Production { transition, output_place } => {
                Latex(format!("\\rho_{{{}}}^{{{}}}", f(transition), f(output_place)))
            }
        }
    }
}

impl ODEParameterType for PerPlaceMassActionParameter {}

// ┌-------------------┐
// | C.2. AnalysisType |
// └-------------------┘

/// Unbalanced ("per-transition") mass-action ODE analysis for Petri nets.
pub struct PetriNetPerPlaceMassActionAnalysis {
    /// Object type for places.
    pub place_ob_type: ModalObType,
    /// Morphism type for transitions.
    pub transition_mor_type: ModalMorType,
}

impl Default for PetriNetPerPlaceMassActionAnalysis {
    fn default() -> Self {
        let ob_type = ModalObType::new(name("Object"));
        Self {
            place_ob_type: ob_type.clone(),
            transition_mor_type: ModalMorType::Zero(ob_type),
        }
    }
}

impl
    ODESemanticsAnalysis<
        <PetriNetPerPlaceMassActionSemantics as ODESemantics>::ModelType,
        <PetriNetPerPlaceMassActionSemantics as ODESemantics>::ParameterType,
    > for PetriNetPerPlaceMassActionAnalysis
{
    fn build_system_builder(
        &self,
        model: &ModalDblModel<Unital>,
    ) -> PolynomialODESystemBuilder<PerPlaceMassActionParameter> {
        let mut builder = PolynomialODESystemBuilder::new();

        // For each place, we create a variable.
        for place in model.ob_generators_with_type(&self.place_ob_type) {
            builder.add_variable(place.clone());
        }

        // Each transition
        //      T : [x_1, ..., x_n] -> [y_1, ..., y_n]
        // gives rise to the contributions
        //      d/dt(x_i) -= Consumption(T <- x_i) x_1 ... x_n
        //      d/dt(y_i) += Production(T -> y_i) x_1 ... x_n.
        for transition in model.mor_generators_with_type(&self.transition_mor_type) {
            let interface = transition_interface(model, &transition);
            let (inputs, outputs) =
                (interface.input_places.clone(), interface.output_places.clone());

            for output in outputs.clone() {
                let id = output.cons(name_seg("ToOutput")).cons(transition.only().unwrap());
                let output_parameter = PerPlaceMassActionParameter::Production {
                    transition: transition.clone(),
                    output_place: output.clone(),
                };
                builder.add_contribution(
                    id,
                    output,
                    ContributionSign::Positive,
                    output_parameter,
                    inputs.clone(),
                );
            }

            for input in inputs.clone() {
                let id = input.cons(name_seg("FromInput")).cons(transition.only().unwrap());
                let input_parameter = PerPlaceMassActionParameter::Consumption {
                    transition: transition.clone(),
                    input_place: input.clone(),
                };
                builder.add_contribution(
                    id,
                    input,
                    ContributionSign::Negative,
                    input_parameter,
                    inputs.clone(),
                );
            }
        }

        builder
    }
}

// ┌--------------------┐
// | C.3. ParameterData |
// └--------------------┘

/// Data input by the user to fill in the parameters numerically.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
#[derive(Clone)]
pub struct PerPlaceMassActionParameterData {
    /// Map from morphism IDs to (map from input objects to consumption rate coefficients).
    #[cfg_attr(feature = "serde", serde(rename = "consumptionRates"))]
    pub(crate) consumption_rates: HashMap<QualifiedName, HashMap<QualifiedName, f32>>,

    /// Map from morphism IDs to (map from input objects to consumption rate coefficients).
    #[cfg_attr(feature = "serde", serde(rename = "productionRates"))]
    pub(crate) production_rates: HashMap<QualifiedName, HashMap<QualifiedName, f32>>,
}

impl ODESemanticsScalarExtension<PerPlaceMassActionParameter> for PerPlaceMassActionParameterData {
    fn extend_scalars(
        &self,
        sys: PolynomialSystem<QualifiedName, Parameter<PerPlaceMassActionParameter>, i8>,
    ) -> PolynomialSystem<QualifiedName, f32, i8> {
        let sys = sys.extend_scalars(|poly| {
            poly.eval(|parameter| match parameter {
                PerPlaceMassActionParameter::Consumption { transition, input_place } => self
                    .consumption_rates
                    .get(transition)
                    .and_then(|rate| rate.get(input_place))
                    .copied()
                    .unwrap_or_default(),
                PerPlaceMassActionParameter::Production { transition, output_place } => self
                    .production_rates
                    .get(transition)
                    .and_then(|rate| rate.get(output_place))
                    .copied()
                    .unwrap_or_default(),
            })
        });

        sys.normalize()
    }
}

/// Data for a numerical per-place mass-action system.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
#[derive(Clone)]
pub struct PerPlaceMassActionProblemData {
    /// Data common to all ODE problems.
    #[cfg_attr(feature = "serde", serde(rename = "generalData"))]
    pub general_data: ODESemanticsGeneralProblemData,
    /// Data specific to per-place mass-action problems.
    #[cfg_attr(feature = "serde", serde(rename = "parameterData"))]
    pub parameter_data: PerPlaceMassActionParameterData,
}

impl ODESemanticsProblemData<PetriNetPerPlaceMassActionSemantics>
    for PerPlaceMassActionProblemData
{
    type ParameterData = PerPlaceMassActionParameterData;
    fn general_data(self) -> ODESemanticsGeneralProblemData {
        self.general_data
    }
    fn parameter_data(self) -> Self::ParameterData {
        self.parameter_data
    }
}

// ┌------------------------------┐
// | MIGRATIONS AND WASM BINDINGS |
// └------------------------------┘

// For backwards compatibility to when there was a *single* mass-action semantics with three
// internal variants, we give here some wrappers that will be useful in `analyses::ode::v1::migrate`
// and also in `catlog-wasm` and `frontend`.

/// The variants of mass-action.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
#[derive(PartialEq, Eq, Hash, Clone)]
pub enum MassActionVariant {
    /// The balanced (i.e. classical) case.
    Balanced,
    /// The unbalanced ("per-flow"/"per-transition") case.
    Unbalanced,
    /// The per-place case.
    PerPlace,
}

/// For `migrate_stock_flow_mass_action_v0_to_v1` to have a well-defined return type, we unify both
/// balanced and unbalanced mass-action semantics into a single struct.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
#[derive(Clone)]
pub struct RestrictedMassActionProblemData {
    /// The mass-action variant of interest, which may be switched at any point.
    pub variant: MassActionVariant,
    /// Problem data for balanced mass-action.
    pub balanced: BalancedMassActionProblemData,
    /// Problem data for unbalanced mass-action.
    pub unbalanced: UnbalancedMassActionProblemData,
}

/// For `migrate_petri_net_mass_action_v0_to_v1` to have a well-defined return type, we unify the
/// all three mass-action semantics into a single struct.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
#[derive(Clone)]
pub struct MassActionProblemData {
    /// The mass-action variant of interest, which may be switched at any point.
    pub variant: MassActionVariant,
    /// Problem data for balanced mass-action.
    pub balanced: BalancedMassActionProblemData,
    /// Problem data for unbalanced mass-action.
    pub unbalanced: UnbalancedMassActionProblemData,
    /// Problem data for per-place mass-action.
    #[cfg_attr(feature = "serde", serde(rename = "perPlace"))]
    pub per_place: PerPlaceMassActionProblemData,
}

// ┌-------┐
// | TESTS |
// └-------┘

#[cfg(test)]
mod tests {
    use expect_test::expect;
    use std::rc::Rc;

    use super::*;
    use crate::{
        latex::{LatexEquation, LatexEquations},
        stdlib::{models::*, theories::*},
    };

    // Symbolic tests.

    // Tests for stock-flow diagrams. These all use the `backward_link` model,
    // which has a single flow x==f==>y and a single link y->f.
    #[test]
    fn balanced_stock_flow() {
        let th = Rc::new(th_category_links());
        let model = backward_link(th);
        let sys = StockFlowBalancedMassActionAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            dx = -Rate(f) x y
            dy = Rate(f) x y
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn unbalanced_stock_flow() {
        let th = Rc::new(th_category_links());
        let model = backward_link(th);
        let sys = StockFlowUnbalancedMassActionAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            dx = -Consumption(f) x y
            dy = Production(f) x y
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    // Tests for Petri nets. These all use the `catalyzed_reaction` model, which
    // has a single transition [x,c]-->f-->[y,c].
    #[test]
    fn balanced_petri() {
        let th = Rc::new(th_sym_monoidal_category());
        let model = catalyzed_reaction(th);
        let sys = PetriNetBalancedMassActionAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            dx = -Rate(f) c x
            dy = Rate(f) c x
            dc = 0
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn unbalanced_petri_per_transition() {
        let th = Rc::new(th_sym_monoidal_category());
        let model = catalyzed_reaction(th);
        let sys = PetriNetUnbalancedMassActionAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            dx = -Consumption(f) c x
            dy = Production(f) c x
            dc = (-Consumption(f) + Production(f)) c x
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn unbalanced_petri_per_place() {
        let th = Rc::new(th_sym_monoidal_category());
        let model = catalyzed_reaction(th);
        let sys = PetriNetPerPlaceMassActionAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            dx = -Consumption([f] <- x) c x
            dy = Production([f] -> y) c x
            dc = (-Consumption([f] <- c) + Production([f] -> c)) c x
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    // Numerical tests.

    // Tests for stock-flow diagrams. These all use the `backward_link` model,
    // which has a single flow x==f==>y and a single link y->f.
    #[test]
    fn balanced_stock_flow_numerical() {
        let th = Rc::new(th_category_links());
        let model = backward_link(th);
        let data = BalancedMassActionProblemData {
            general_data: ODESemanticsGeneralProblemData {
                initial_values: [(name("x"), 1.0), (name("y"), 1.5)].into_iter().collect(),
                duration: 10.0,
            },
            parameter_data: BalancedMassActionParameterData {
                rates: [(name("f"), 2.0)].into_iter().collect(),
            },
        };
        let sys = StockFlowBalancedMassActionAnalysis::default().build_system(&model);
        let analysis = data.parameter_data.extend_scalars(sys);
        let expected = expect!([r#"
            dx = -2 x y
            dy = 2 x y
        "#]);
        expected.assert_eq(&analysis.to_string());
    }

    #[test]
    fn unbalanced_stock_flow_numerical() {
        let th = Rc::new(th_category_links());
        let model = backward_link(th);
        let data = UnbalancedMassActionProblemData {
            general_data: ODESemanticsGeneralProblemData {
                initial_values: [(name("x"), 1.0), (name("y"), 1.5)].into_iter().collect(),
                duration: 10.0,
            },
            parameter_data: UnbalancedMassActionParameterData {
                consumption_rates: [(name("f"), 1.5)].into_iter().collect(),
                production_rates: [(name("f"), 2.0)].into_iter().collect(),
            },
        };
        let sys = StockFlowUnbalancedMassActionAnalysis::default().build_system(&model);
        let analysis = data.parameter_data.extend_scalars(sys);
        let expected = expect!([r#"
            dx = -1.5 x y
            dy = 2 x y
        "#]);
        expected.assert_eq(&analysis.to_string());
    }

    #[test]
    fn balanced_petri_numerical() {
        let th = Rc::new(th_sym_monoidal_category());
        let model = catalyzed_reaction(th);
        let data = BalancedMassActionProblemData {
            general_data: ODESemanticsGeneralProblemData {
                initial_values: [(name("x"), 1.0), (name("y"), 1.5), (name("c"), 2.0)]
                    .into_iter()
                    .collect(),
                duration: 10.0,
            },
            parameter_data: BalancedMassActionParameterData {
                rates: [(name("f"), 1.5)].into_iter().collect(),
            },
        };
        let sys = PetriNetBalancedMassActionAnalysis::default().build_system(&model);
        let analysis = data.parameter_data.extend_scalars(sys);
        let expected = expect!([r#"
            dx = -1.5 c x
            dy = 1.5 c x
            dc = 0
        "#]);
        expected.assert_eq(&analysis.to_string());
    }

    #[test]
    fn unbalanced_petri_per_transition_numerical() {
        let th = Rc::new(th_sym_monoidal_category());
        let model = catalyzed_reaction(th);
        let data = UnbalancedMassActionProblemData {
            general_data: ODESemanticsGeneralProblemData {
                initial_values: [(name("x"), 1.0), (name("y"), 1.5), (name("c"), 2.0)]
                    .into_iter()
                    .collect(),
                duration: 10.0,
            },
            parameter_data: UnbalancedMassActionParameterData {
                consumption_rates: [(name("f"), 3.5)].into_iter().collect(),
                production_rates: [(name("f"), 4.0)].into_iter().collect(),
            },
        };
        let sys = PetriNetUnbalancedMassActionAnalysis::default().build_system(&model);
        let analysis = data.parameter_data.extend_scalars(sys);
        let expected = expect!([r#"
            dx = -3.5 c x
            dy = 4 c x
            dc = 0.5 c x
        "#]);
        expected.assert_eq(&analysis.to_string());
    }

    #[test]
    fn unbalanced_petri_per_place_numerical() {
        let th = Rc::new(th_sym_monoidal_category());
        let model = catalyzed_reaction(th);
        let data = PerPlaceMassActionProblemData {
            general_data: ODESemanticsGeneralProblemData {
                initial_values: [(name("x"), 1.0), (name("y"), 1.5), (name("c"), 2.0)]
                    .into_iter()
                    .collect(),
                duration: 10.0,
            },
            parameter_data: PerPlaceMassActionParameterData {
                consumption_rates: [(
                    name("f"),
                    [(name("x"), 2.0), (name("c"), 3.0)].into_iter().collect(),
                )]
                .into_iter()
                .collect(),
                production_rates: [(
                    name("f"),
                    [(name("y"), 1.5), (name("c"), 2.5)].into_iter().collect(),
                )]
                .into_iter()
                .collect(),
            },
        };
        let sys = PetriNetPerPlaceMassActionAnalysis::default().build_system(&model);
        let analysis = data.parameter_data.extend_scalars(sys);
        let expected = expect!([r#"
            dx = -2 c x
            dy = 1.5 c x
            dc = -0.5 c x
        "#]);
        expected.assert_eq(&analysis.to_string());
    }

    // LaTeX tests.
    #[test]
    fn to_latex() {
        let th = Rc::new(th_category_links());
        let model = backward_link(th);
        let sys = StockFlowUnbalancedMassActionAnalysis::default().build_system(&model);
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
