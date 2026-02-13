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

/// The associated direction of a "flow" term. Note that this is *opposite* from
/// the terminology of "input" and "output", i.e. a flow A=>B gives rise to an
/// *incoming flow to B* and an *outgoing flow from A*.
///
/// To accommodate Petri nets, where transitions can have multiple input/output
/// arcs, we need to carry around more information: a flow term could describe
/// not only the transition but also the corresponding input/output place.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone)]
pub enum DirectedTerm {
    /// The parameter corresponds to an incoming flow to a specific output.
    IncomingFlow {
        /// The transition/flow
        transition: QualifiedName,
        /// The output place/stock
        output: QualifiedName,
    },

    /// The parameter corresponds to an outgoing flow to a specific input.
    OutgoingFlow {
        /// The transition/flow
        transition: QualifiedName,
        /// The input place/stock
        input: QualifiedName,
    },
}

impl fmt::Display for DirectedTerm {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self {
            DirectedTerm::IncomingFlow { transition: tran, output: outp } => {
                write!(f, "([{}]->{})", tran, outp)
            }
            DirectedTerm::OutgoingFlow { transition: tran, input: inp } => {
                write!(f, "({}->[{}])", inp, tran)
            }
        }
    }
}

/// When mass is not necessarily conserved, consumption/production rate parameters
/// can be set either *per transition* or *per place*.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone, Serialize, Deserialize)]
pub enum RateGranularity {
    /// Each transition gets assigned a single consumption and single production rate
    PerTransition,

    /// Each transition gets assigned a consumption rate for each input place and
    /// a production rate for each output place.
    PerPlace
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
    #[cfg_attr(feature = "serde", serde(rename = "massConservation"))]
    pub mass_conservation: bool,

    /// (If mass is not conserved) whether rate parameters should be per-transition or per-object.
    #[cfg_attr(feature = "serde", serde(default, rename = "rateGranularity"))]
    pub rate_granularity: Option<RateGranularity>,

    /// Map from morphism IDs to (map from input objects to consumption rate coefficients) (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "consumptionRates"))]
    consumption_rates: HashMap<QualifiedName, HashMap<QualifiedName, f32>>,

    /// Map from morphism IDs to (map from output objects to production rate coefficients) (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "productionRates"))]
    production_rates: HashMap<QualifiedName, HashMap<QualifiedName, f32>>,

    /// Map from object IDs to initial values (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "initialValues"))]
    pub initial_values: HashMap<QualifiedName, f32>,

    /// Duration of simulation.
    pub duration: f32,
}

/// Symbolic parameter in mass-action polynomial system.
type Parameter<Id> = Polynomial<Id, f32, i8>;

impl StockFlowMassActionAnalysis {
    /// Creates an unbalanced mass-action system with symbolic rate coefficients.
    pub fn build_unbalanced_system(
        &self,
        model: &DiscreteTabModel,
    ) -> PolynomialSystem<QualifiedName, Parameter<DirectedTerm>, i8> {
        let terms: Vec<_> = self.flow_monomials(model).into_iter().collect();

        let mut sys = PolynomialSystem::new();
        for ob in model.ob_generators_with_type(&self.stock_ob_type) {
            sys.add_term(ob, Polynomial::zero());
        }
        for (flow, term) in terms {
            let dom = model.mor_generator_dom(&flow).unwrap_basic();
            let cod = model.mor_generator_cod(&flow).unwrap_basic();
            let dom_param = Parameter::generator(DirectedTerm::OutgoingFlow {
                transition: flow.clone(),
                input: dom.clone(),
            });
            let cod_param = Parameter::generator(DirectedTerm::IncomingFlow {
                transition: flow,
                output: cod.clone(),
            });
            let dom_term: Polynomial<_, _, _> = [(dom_param, term.clone())].into_iter().collect();
            let cod_term: Polynomial<_, _, _> = [(cod_param, term)].into_iter().collect();
            sys.add_term(dom, -dom_term);
            sys.add_term(cod, cod_term);
        }
        sys
    }
}

impl PetriNetMassActionAnalysis {
    /// Creates an unbalanced mass-action system with symbolic rate coefficients.
    pub fn build_unbalanced_system(
        &self,
        model: &ModalDblModel,
    ) -> PolynomialSystem<QualifiedName, Parameter<DirectedTerm>, i8> {
        let mut sys = PolynomialSystem::new();
        for ob in model.ob_generators_with_type(&self.place_ob_type) {
            sys.add_term(ob, Polynomial::zero());
        }
        for mor in model.mor_generators_with_type(&self.transition_mor_type) {
            let (inputs, outputs) = Self::transition_interface(model, &mor);
            let term: Monomial<_, _> =
                inputs.iter().map(|ob| (ob.clone().unwrap_generator(), 1)).collect();

            for input in inputs {
                let input_term: Polynomial<_, _, _> = [(
                    Parameter::generator(DirectedTerm::OutgoingFlow {
                        transition: mor.clone(),
                        input: input.clone().unwrap_generator(),
                    }),
                    term.clone(),
                )]
                .into_iter()
                .collect();
                sys.add_term(input.unwrap_generator(), -input_term.clone());
            }
            for output in outputs {
                let output_term: Polynomial<_, _, _> = [(
                    Parameter::generator(DirectedTerm::IncomingFlow {
                        transition: mor.clone(),
                        output: output.clone().unwrap_generator(),
                    }),
                    term.clone(),
                )]
                .into_iter()
                .collect();
                sys.add_term(output.unwrap_generator(), output_term.clone());
            }
        }

        sys.normalize()
    }
}

/// Substitutes numerical rate coefficients into a symbolic mass-action system.
pub fn extend_unbalanced_mass_action_scalars(
    sys: PolynomialSystem<QualifiedName, Parameter<DirectedTerm>, i8>,
    data: &UnbalancedMassActionProblemData,
) -> PolynomialSystem<QualifiedName, f32, i8> {
    sys.extend_scalars(|poly| {
        poly.eval(|flow| match flow {
            DirectedTerm::IncomingFlow { transition: tran, output: outp } => {
                data.production_rates.get(tran).cloned().unwrap_or_default().get(outp).copied().unwrap_or_default()
            }
            DirectedTerm::OutgoingFlow { transition: tran, input: inp } => {
                data.consumption_rates.get(tran).cloned().unwrap_or_default().get(inp).copied().unwrap_or_default()
            }
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
