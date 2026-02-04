//! Unbalanced mass-action ODE analysis of models.
//!
//! Such ODEs are a "weaker" version of those from mass-action dynamics, in that
//! we do not here require that mass be preserved. This allows the construction
//! of systems of arbitrary polynomial (first-order) ODEs.

use std::{fmt, collections::HashMap};

use indexmap::IndexMap;
use nalgebra::DVector;
use num_traits::Zero;
// use rebop::gillespie;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::{ODEAnalysis};
use crate::{dbl::{
    model::{DiscreteTabModel, FgDblModel, ModalDblModel, MutDblModel, TabEdge},
    theory::{ModalMorType, ModalObType, TabMorType, TabObType}
}};
use crate::one::FgCategory;
use crate::simulate::ode::{NumericalPolynomialSystem, ODEProblem, PolynomialSystem};
use crate::zero::{QualifiedName, alg::Polynomial, name, rig::Monomial};

/// The associated direction of a "flow" term
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone)]
pub enum DirectedParameter {
    /// The parameter corresponds to an incoming flow 
    In(QualifiedName),

    /// The parameter corresponds to an outgoing flow
    Out(QualifiedName),
}

impl fmt::Display for DirectedParameter {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self {
            DirectedParameter::In(name) => write!(f, "In({})", name),
            DirectedParameter::Out(name) => write!(f, "Out({})", name),
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
    /// Map from morphism IDs to input/output rate coefficients (nonnegative reals).
    rates: HashMap<QualifiedName, f32>,

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

impl PetriNetUnbalancedMassActionAnalysis {
    /// Creates a mass-action system with symbolic rate coefficients.
    pub fn build_system(
        &self,
        model: &ModalDblModel,
    ) -> PolynomialSystem<QualifiedName, Parameter<QualifiedName>, i8> {
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
}

/// Mass-action ODE analysis for stock-flow models.
pub struct StockFlowUnbalancedMassActionAnalysis {
    /// Object type for stocks.
    pub stock_ob_type: TabObType,
    /// Morphism type for flows between stocks.
    pub flow_mor_type: TabMorType,
    /// Morphism type for positive links from stocks to flows.
    pub pos_link_mor_type: TabMorType,
    /// Morphism type for negative links from stocks to flows.
    pub neg_link_mor_type: TabMorType,
}

impl Default for StockFlowUnbalancedMassActionAnalysis {
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

impl StockFlowUnbalancedMassActionAnalysis {
    /// Creates a mass-action system with symbolic rate coefficients.
    pub fn build_system(
        &self,
        model: &DiscreteTabModel,
    ) -> PolynomialSystem<QualifiedName, Parameter<DirectedParameter>, i8> {
        let mut terms: HashMap<QualifiedName, Monomial<QualifiedName, i8>> = model
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

        let terms: Vec<_> = terms.into_iter().collect();

        let mut sys = PolynomialSystem::new();
        for ob in model.ob_generators_with_type(&self.stock_ob_type) {
            sys.add_term(ob, Polynomial::zero());
        }
        for (flow, term) in &terms {
            let dom = model.mor_generator_dom(&flow).unwrap_basic();
            let param = Parameter::generator(DirectedParameter::Out(flow.clone()));
            let term: Polynomial<_, _, _> = [(param, term.clone())].into_iter().collect();
            sys.add_term(dom, -term);
        }
        for (flow, term) in &terms {
            let cod = model.mor_generator_cod(&flow).unwrap_basic();
            let param = Parameter::generator(DirectedParameter::In(flow.clone()));
            let term: Polynomial<_, _, _> = [(param, term.clone())].into_iter().collect();
            sys.add_term(cod, term);
        }
        sys
    }
}

/// Substitutes numerical rate coefficients into a symbolic mass-action system.
pub fn extend_unbalanced_mass_action_scalars(
    sys: PolynomialSystem<QualifiedName, Parameter<DirectedParameter>, i8>,
    data: &UnbalancedMassActionProblemData,
) -> PolynomialSystem<QualifiedName, f32, i8> {
    sys.extend_scalars(|poly| poly.eval(|flow| {
        match flow {
            DirectedParameter::In(name) => data.rates.get(name).copied().unwrap_or_default(),
            DirectedParameter::Out(name) => data.rates.get(name).copied().unwrap_or_default(),
        }
    }))
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
    // use crate::simulate::ode::LatexEquation;
    use crate::stdlib::{models::*, theories::*};

    #[test]
    fn backward_link_dynamics() {
        let th = Rc::new(th_category_links());
        let model = backward_link(th);
        let sys = StockFlowUnbalancedMassActionAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            dx = (-Out(f)) x y
            dy = (In(f)) x y
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn positive_backward_link_dynamics() {
        let th = Rc::new(th_category_signed_links());
        let model = positive_backward_link(th);
        let sys = StockFlowUnbalancedMassActionAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            dx = (-Out(f)) x y
            dy = (In(f)) x y
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn negative_backward_link_dynamics() {
        let th = Rc::new(th_category_signed_links());
        let model = negative_backward_link(th);
        let sys = StockFlowUnbalancedMassActionAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            dx = (-Out(f)) x y^{-1}
            dy = (In(f)) x y^{-1}
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    // #[test]
    // fn catalysis_dynamics() {
    //     let th = Rc::new(th_sym_monoidal_category());
    //     let model = catalyzed_reaction(th);
    //     let sys = PetriNetUnbalancedMassActionAnalysis::default().build_system(&model);
    //     let expected = expect!([r#"
    //         dx = (-Out(f)) c x
    //         dy = (In(f)) c x
    //         dc = 0
    //     "#]);
    //     expected.assert_eq(&sys.to_string());
    // }

    // #[test]
    // fn to_latex() {
    //     let th = Rc::new(th_category_links());
    //     let model = backward_link(th);
    //     let sys = StockFlowUnbalancedMassActionAnalysis::default().build_system(&model);
    //     let expected = vec![
    //         LatexEquation {
    //             lhs: "\\dot{x}".to_string(),
    //             rhs: "(-f) x y".to_string(),
    //         },
    //         LatexEquation {
    //             lhs: "\\dot{y}".to_string(),
    //             rhs: "f x y".to_string(),
    //         },
    //     ];
    //     assert_eq!(expected, sys.to_latex_equations());
    // }
}
