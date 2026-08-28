//! Unbalanced mass-action semantics.

use std::{collections::HashMap, fmt};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use crate::latex::{Latex, ToLatexWithMap};
use crate::simulate::ode::PolynomialSystem;
use crate::stdlib::analyses::ode::Parameter;
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

    // Tests for stock-flow diagrams. These all use the `backward_link` model,
    // which has a single flow x==f==>y and a single link y->f.

    // Symbolic tests.
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

    // Numerical tests.
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

    // Tests for Petri nets. These all use the `catalyzed_reaction` model, which
    // has a single transition [x,c]-->f-->[y,c].

    // Symbolic tests.
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

    // Numerical tests.
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
}
