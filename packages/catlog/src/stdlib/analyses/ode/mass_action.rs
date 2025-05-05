/*! Mass-action ODE analysis of models.

Such ODEs are based on the *law of mass action* familiar from chemistry and
mathematical epidemiology.
 */

use std::collections::HashMap;
use std::hash::{BuildHasherDefault, Hash};

use nalgebra::DVector;
use num_traits::Zero;
use ustr::{IdentityHasher, Ustr, ustr};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify_next::Tsify;

use super::ODEAnalysis;
use crate::dbl::{
    model::{DiscreteTabModel, FgDblModel, TabEdge},
    theory::{TabMorType, TabObType},
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

type Parameter<Id> = Polynomial<Id, f32, u8>;
type StockFlowModel<Id> = DiscreteTabModel<Id, Ustr, BuildHasherDefault<IdentityHasher>>;

/** Mass-action ODE analysis for stock-flow models.

Mass action dynamics TODO
 */
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
    /** Creates a mass-action system from a model.

    The resulting system has symbolic rate coefficients.
     */
    pub fn create_system<Id: Eq + Clone + Hash + Ord>(
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

        let mut sys: PolynomialSystem<Id, Parameter<Id>, u8> = PolynomialSystem::new();
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

    /** Creates a numerical mass-action system from a model.

    The resulting system has numerical rate coefficients and is ready to solve.
     */
    pub fn create_numerical_system<Id: Eq + Clone + Hash + Ord>(
        &self,
        model: &StockFlowModel<Id>,
        data: MassActionProblemData<Id>,
    ) -> ODEAnalysis<Id, NumericalPolynomialSystem<u8>> {
        let sys = self.create_system(model);

        let objects: Vec<_> = sys.components.keys().cloned().collect();
        let initial_values = objects
            .iter()
            .map(|ob| data.initial_values.get(ob).copied().unwrap_or_default());
        let x0 = DVector::from_iterator(objects.len(), initial_values);

        let sys = sys
            .extend_scalars(|poly| {
                poly.eval(|flow| data.rates.get(flow).copied().unwrap_or_default())
            })
            .to_numerical();

        let problem = ODEProblem::new(sys, x0).end_time(data.duration);
        let ob_index: HashMap<_, _> =
            objects.into_iter().enumerate().map(|(i, x)| (x, i)).collect();
        ODEAnalysis::new(problem, ob_index)
    }
}

#[cfg(test)]
mod tests {
    use expect_test::expect;
    use std::sync::Arc;

    use super::*;
    use crate::stdlib::{models::backward_link, theories::th_category_links};

    #[test]
    fn backward_link_dynamics() {
        let th = Arc::new(th_category_links());
        let model = backward_link(th);
        let analysis: StockFlowMassActionAnalysis = Default::default();
        let sys = analysis.create_system(&model);
        let expected = expect!([r#"
            dx = ((-1) f) x y
            dy = f x y
        "#]);
        expected.assert_eq(&sys.to_string());
    }
}
