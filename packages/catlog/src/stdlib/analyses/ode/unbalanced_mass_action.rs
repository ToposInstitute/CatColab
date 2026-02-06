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

use super::ODEAnalysis;
use crate::dbl::{
    model::{DiscreteTabModel, FgDblModel, TabEdge},
    theory::{TabMorType, TabObType},
};
use crate::one::FgCategory;
use crate::simulate::ode::{NumericalPolynomialSystem, ODEProblem, PolynomialSystem};
use crate::zero::{QualifiedName, alg::Polynomial, name, rig::Monomial};

/// The associated direction of a "flow" term. Note that this is *opposite* from
/// the terminology of "input" and "output", i.e. a flow A=>B gives rise to an
/// *incoming flow to B* and an *outgoing flow from A*.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone)]
pub enum DirectedTerm {
    /// The parameter corresponds to an incoming flow
    IncomingFlow(QualifiedName),

    /// The parameter corresponds to an outgoing flow
    OutgoingFlow(QualifiedName),
}

impl fmt::Display for DirectedTerm {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self {
            DirectedTerm::IncomingFlow(name) => write!(f, "Incoming({})", name),
            DirectedTerm::OutgoingFlow(name) => write!(f, "Outgoing({})", name),
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
    /// Map from morphism IDs to consumption rate coefficients (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "consumptionRates"))]
    consumption_rates: HashMap<QualifiedName, f32>,

    /// Map from morphism IDs to production rate coefficients (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "productionRates"))]
    production_rates: HashMap<QualifiedName, f32>,

    /// Map from object IDs to initial values (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "initialValues"))]
    pub initial_values: HashMap<QualifiedName, f32>,

    /// Duration of simulation.
    pub duration: f32,
}

/// Symbolic parameter in mass-action polynomial system.
type Parameter<Id> = Polynomial<Id, f32, i8>;

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
    ) -> PolynomialSystem<QualifiedName, Parameter<DirectedTerm>, i8> {
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
            let dom = model.mor_generator_dom(flow).unwrap_basic();
            let param = Parameter::generator(DirectedTerm::OutgoingFlow(flow.clone()));
            let term: Polynomial<_, _, _> = [(param, term.clone())].into_iter().collect();
            sys.add_term(dom, -term);
        }
        for (flow, term) in &terms {
            let cod = model.mor_generator_cod(flow).unwrap_basic();
            let param = Parameter::generator(DirectedTerm::IncomingFlow(flow.clone()));
            let term: Polynomial<_, _, _> = [(param, term.clone())].into_iter().collect();
            sys.add_term(cod, term);
        }
        sys
    }
}

/// Substitutes numerical rate coefficients into a symbolic mass-action system.
pub fn extend_unbalanced_mass_action_scalars(
    sys: PolynomialSystem<QualifiedName, Parameter<DirectedTerm>, i8>,
    data: &UnbalancedMassActionProblemData,
) -> PolynomialSystem<QualifiedName, f32, i8> {
    sys.extend_scalars(|poly| {
        poly.eval(|flow| match flow {
            DirectedTerm::IncomingFlow(name) => {
                data.production_rates.get(name).copied().unwrap_or_default()
            }
            DirectedTerm::OutgoingFlow(name) => {
                data.consumption_rates.get(name).copied().unwrap_or_default()
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
    use crate::stdlib::{models::*, theories::*};

    #[test]
    fn backward_link_dynamics() {
        let th = Rc::new(th_category_links());
        let model = backward_link(th);
        let sys = StockFlowUnbalancedMassActionAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            dx = (-Outgoing(f)) x y
            dy = (Incoming(f)) x y
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn positive_backward_link_dynamics() {
        let th = Rc::new(th_category_signed_links());
        let model = positive_backward_link(th);
        let sys = StockFlowUnbalancedMassActionAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            dx = (-Outgoing(f)) x y
            dy = (Incoming(f)) x y
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn negative_backward_link_dynamics() {
        let th = Rc::new(th_category_signed_links());
        let model = negative_backward_link(th);
        let sys = StockFlowUnbalancedMassActionAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            dx = (-Outgoing(f)) x y^{-1}
            dy = (Incoming(f)) x y^{-1}
        "#]);
        expected.assert_eq(&sys.to_string());
    }
}
