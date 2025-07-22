/*! Mass-action ODE analysis of models.

Such ODEs are based on the *law of mass action* familiar from chemistry and
mathematical epidemiology.
 */

use std::collections::{BTreeMap, HashMap};
use std::fmt::Debug;
use std::hash::{BuildHasherDefault, Hash};

use nalgebra::DVector;
use num_traits::Zero;
use ustr::{IdentityHasher, Ustr, ustr};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::ODEAnalysis;
use crate::dbl::{
    model::{DiscreteTabModel, FgDblModel, ModalDblModel, MutDblModel, TabEdge},
    theory::{ModalMorType, ModalObType, TabMorType, TabObType},
};
use crate::one::FgCategory;
use crate::simulate::ode::{NumericalPolynomialSystem, ODEProblem, PolynomialSystem};
use crate::zero::{alg::Polynomial, rig::Monomial};

/// Data defining a mass-action ODE problem for a model.
#[derive(Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct MassActionProblemData<Id>
where
    Id: Eq + Hash,
{
    /// Map from morphism IDs to rate coefficients (nonnegative reals).
    rates: HashMap<Id, f32>,

    /// Map from object IDs to initial values (nonnegative reals).
    #[cfg_attr(feature = "serde", serde(rename = "initialValues"))]
    initial_values: HashMap<Id, f32>,

    /// Duration of simulation.
    duration: f32,
}

/// Symbolic parameter in mass-action polynomial system.
type Parameter<Id> = Polynomial<Id, f32, u8>;

type PetriNetModel<Id> = ModalDblModel<Id, Ustr, BuildHasherDefault<IdentityHasher>>;

/// Mass-action ODE analysis for Petri nets.
pub struct PetriNetMassActionAnalysis {
    /// Object type for places.
    pub place_ob_type: ModalObType<Ustr>,
    /// Morphism type for transitions.
    pub transition_mor_type: ModalMorType<Ustr>,
}

impl Default for PetriNetMassActionAnalysis {
    fn default() -> Self {
        let ob_type = ModalObType::new(ustr("Object"));
        Self {
            place_ob_type: ob_type.clone(),
            transition_mor_type: ModalMorType::Zero(ob_type),
        }
    }
}

impl PetriNetMassActionAnalysis {
    /// Creates a mass-action system with symbolic rate coefficients.
    pub fn build_system<Id: Eq + Clone + Hash + Ord + Debug>(
        &self,
        model: &PetriNetModel<Id>,
    ) -> PolynomialSystem<Id, Parameter<Id>, u8> {
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

    /// Creates a mass-action system with numerical rate coefficients.
    pub fn build_numerical_system<Id: Eq + Clone + Hash + Ord + Debug>(
        &self,
        model: &PetriNetModel<Id>,
        data: MassActionProblemData<Id>,
    ) -> ODEAnalysis<Id, NumericalPolynomialSystem<u8>> {
        into_numerical_system(self.build_system(model), data)
    }
}

type StockFlowModel<Id> = DiscreteTabModel<Id, Ustr, BuildHasherDefault<IdentityHasher>>;

/// Mass-action ODE analysis for stock-flow models.
pub struct StockFlowMassActionAnalysis {
    /// Object type for stocks.
    pub stock_ob_type: TabObType<Ustr, Ustr>,
    /// Morphism types for flows between stocks.
    pub flow_mor_type: TabMorType<Ustr, Ustr>,
    /// Morphism types for links for stocks to flows.
    pub link_mor_type: TabMorType<Ustr, Ustr>,
}

impl Default for StockFlowMassActionAnalysis {
    fn default() -> Self {
        let stock_ob_type = TabObType::Basic(ustr("Object"));
        let flow_mor_type = TabMorType::Hom(Box::new(stock_ob_type.clone()));
        Self {
            stock_ob_type,
            flow_mor_type,
            link_mor_type: TabMorType::Basic(ustr("Link")),
        }
    }
}

impl StockFlowMassActionAnalysis {
    /// Creates a mass-action system with symbolic rate coefficients.
    pub fn build_system<Id: Eq + Clone + Hash + Ord>(
        &self,
        model: &StockFlowModel<Id>,
    ) -> PolynomialSystem<Id, Parameter<Id>, u8> {
        let mut terms: HashMap<Id, Monomial<Id, u8>> = model
            .mor_generators_with_type(&self.flow_mor_type)
            .map(|flow| {
                let dom = model.mor_generator_dom(&flow).unwrap_basic();
                (flow, Monomial::generator(dom))
            })
            .collect();

        for link in model.mor_generators_with_type(&self.link_mor_type) {
            let dom = model.mor_generator_dom(&link).unwrap_basic();
            let path = model.mor_generator_cod(&link).unwrap_tabulated();
            let Some(TabEdge::Basic(cod)) = path.only() else {
                panic!("Codomain of link should be basic morphism");
            };
            if let Some(term) = terms.get_mut(&cod) {
                *term = std::mem::take(term) * Monomial::generator(dom);
            } else {
                panic!("Codomain of link does not belong to model");
            };
        }

        let terms: Vec<(Id, Polynomial<Id, Parameter<Id>, u8>)> = terms
            .into_iter()
            .map(|(flow, term)| {
                let param = Parameter::generator(flow.clone());
                (flow, [(param, term)].into_iter().collect())
            })
            .collect();

        let mut sys = PolynomialSystem::new();
        for ob in model.ob_generators_with_type(&self.stock_ob_type) {
            sys.add_term(ob, Polynomial::zero());
        }
        for (flow, term) in terms.iter() {
            let dom = model.mor_generator_dom(flow).unwrap_basic();
            sys.add_term(dom, -term.clone());
        }
        for (flow, term) in terms {
            let cod = model.mor_generator_cod(&flow).unwrap_basic();
            sys.add_term(cod, term);
        }
        sys
    }

    /// Creates a mass-action system with numerical rate coefficients.
    pub fn build_numerical_system<Id: Eq + Clone + Hash + Ord>(
        &self,
        model: &StockFlowModel<Id>,
        data: MassActionProblemData<Id>,
    ) -> ODEAnalysis<Id, NumericalPolynomialSystem<u8>> {
        into_numerical_system(self.build_system(model), data)
    }
}

fn into_numerical_system<Id: Eq + Clone + Hash + Ord>(
    sys: PolynomialSystem<Id, Parameter<Id>, u8>,
    data: MassActionProblemData<Id>,
) -> ODEAnalysis<Id, NumericalPolynomialSystem<u8>> {
    let ob_index: BTreeMap<_, _> =
        sys.components.keys().cloned().enumerate().map(|(i, x)| (x, i)).collect();
    let n = ob_index.len();

    let initial_values = ob_index
        .keys()
        .map(|ob| data.initial_values.get(ob).copied().unwrap_or_default());
    let x0 = DVector::from_iterator(n, initial_values);

    let sys = sys
        .extend_scalars(|poly| poly.eval(|flow| data.rates.get(flow).copied().unwrap_or_default()))
        .to_numerical();

    let problem = ODEProblem::new(sys, x0).end_time(data.duration);
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
        let sys = StockFlowMassActionAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            dx = ((-1) f) x y
            dy = f x y
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn catalysis_dynamics() {
        let th = Rc::new(th_sym_monoidal_category());
        let model = catalyzed_reaction(th);
        let sys = PetriNetMassActionAnalysis::default().build_system(&model);
        let expected = expect!([r#"
            dc = 0
            dx = ((-1) f) c x
            dy = f c x
        "#]);
        expected.assert_eq(&sys.to_string());
    }
}
