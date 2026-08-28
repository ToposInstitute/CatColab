//! Per-place unbalanced mass-action semantics.

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
use crate::zero::{QualifiedName, name};
use crate::{
    dbl::{
        model::{FpDblModel, ModalDblModel},
        theory::{ModalMorType, ModalObType, Unital},
    },
    zero::name_seg,
};

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

// ┌-------┐
// | TESTS |
// └-------┘

#[cfg(test)]
mod tests {
    use expect_test::expect;
    use std::rc::Rc;

    use super::*;
    use crate::stdlib::{models::*, theories::*};

    // Tests for Petri nets. These all use the `catalyzed_reaction` model, which
    // has a single transition [x,c]-->f-->[y,c].

    // Symbolic tests.
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
}
