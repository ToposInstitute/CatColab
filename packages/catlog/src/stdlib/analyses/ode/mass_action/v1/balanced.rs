//! Balanced mass-action semantics.

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

// ┌-------┐
// | TESTS |
// └-------┘

#[cfg(test)]
mod tests {
    use expect_test::expect;
    use std::rc::Rc;

    use super::*;
    use crate::stdlib::{models::*, theories::*};

    // Tests for stock-flow diagrams. These all use the `backward_link` model,
    // which has a single flow x==f==>y and a single link y->f.

    // Symbolic tests.
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

    // Numerical tests.
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

    // Tests for Petri nets. These all use the `catalyzed_reaction` model, which
    // has a single transition [x,c]-->f-->[y,c].

    // Symbolic tests.
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

    // Numerical tests.
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
}
