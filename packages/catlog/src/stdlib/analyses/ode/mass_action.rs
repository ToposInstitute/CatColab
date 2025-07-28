/*! Mass-action ODE analysis of models.

Such ODEs are based on the *law of mass action* familiar from chemistry and
mathematical epidemiology.
 */

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fmt::Debug;
use std::hash::Hash;

use itertools::Itertools;

use nalgebra::DVector;
use num_traits::Zero;
use ustr::{ustr, Ustr};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::ODEAnalysis;
use crate::dbl::{
    model::{DiscreteTabModel, FgDblModel, ModalDblModel, ModalMor, ModalOb, MutDblModel, TabEdge},
    theory::{ModalMorType, ModalObType, ModeApp, TabMorType, TabObType},
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

/** Mass-action ODE analysis for Petri nets.

This struct implements the object part of the functorial semantics for reaction
networks (aka, Petri nets) due to [Baez & Pollard](crate::refs::ReactionNets).
 */
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
        model: &ModalDblModel<Id, Ustr>,
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
        model: &ModalDblModel<Id, Ustr>,
        data: MassActionProblemData<Id>,
    ) -> ODEAnalysis<Id, NumericalPolynomialSystem<u8>> {
        into_numerical_system(self.build_system(model), data)
    }
}

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
        model: &DiscreteTabModel<Id, Ustr>,
    ) -> PolynomialSystem<Id, Parameter<Id>, u8> {
        // associate each flow to its domain.
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
        model: &DiscreteTabModel<Id, Ustr>,
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

// ------------------------------------------------------------------------- //

/// Data defining a mass-action ODE problem for a model with function parameters
#[derive(Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct AnotherMassActionProblemData<Id>
where
    Id: Eq + Hash,
{
    /// mass action problem data
    pub mass: MassActionProblemData<Id>,

    /// functions associated to T(aux) --> aux
    pub functions: HashMap<Id, f32>,
}

// TODO rename
/**
 */
pub struct PetriNetMassActionFunctionAnalysis {
    /// Object type for states
    pub state_ob_type: ModalObType<Ustr>,
    /// Object type for auxiliary variables
    pub aux_ob_type: ModalObType<Ustr>,
    /// Morphism type for ...
    pub fun_mor_type: ModalMorType<Ustr>,
    ///
    pub borrow_mor_type: ModalMorType<Ustr>,
    ///
    pub outpos_mor_type: ModalMorType<Ustr>,
    ///
    pub outneg_mor_type: ModalMorType<Ustr>,
}

// TODO
impl Default for PetriNetMassActionFunctionAnalysis {
    fn default() -> Self {
        Self {
            state_ob_type: ModalObType::new(ustr("State")),
            aux_ob_type: ModalObType::new(ustr("Auxiliary")),
            fun_mor_type: ModalMorType::One(ModeApp::new(ustr("function"))),
            borrow_mor_type: ModalMorType::One(ModeApp::new(ustr("borrowing"))),
            outpos_mor_type: ModalMorType::One(ModeApp::new(ustr("out-pos"))),
            outneg_mor_type: ModalMorType::One(ModeApp::new(ustr("out-neg"))),
        }
    }
}

impl PetriNetMassActionFunctionAnalysis {
    fn comps<Id>(&self, model: &ModalDblModel<Id, Ustr>) -> HashMap<Id, Vec<Id>>
    where
        Id: Clone + Debug + Hash + Eq + Ord,
    {
        let arrows = model.mor_generators_with_type(&self.fun_mor_type);
        fn search<Id>(
            mut component: Vec<Id>,
            input: ModalOb<Id, Ustr>,
            model: &ModalDblModel<Id, Ustr>,
            fun_mor_type: &ModalMorType<Ustr>,
        ) -> Vec<Id>
        where
            Id: Clone + Debug + Hash + Eq + Ord,
        {
            let mut out = Vec::new();
            if let Some(arrow) = model
                .mor_generators_with_type(fun_mor_type)
                .find(|arr| model.mor_generator_cod(arr) == input.clone())
            {
                component.push(arrow.clone());
                for el in component.clone() {
                    out.push(el)
                }
                for input in vec![model.mor_generator_dom(&arrow)].iter() {
                    search(component.clone(), input.clone(), model, fun_mor_type);
                }
            }
            out
        }
        let outpos = model.mor_generators_with_type(&self.outpos_mor_type);
        let outneg = model.mor_generators_with_type(&self.outneg_mor_type);
        let outpos_dom = outpos.map(|p| model.mor_generator_dom(&p));
        let mut outneg_dom = outneg.map(|p| model.mor_generator_dom(&p));

        let mediators: Vec<_> = outpos_dom.filter(|el| outneg_dom.contains(el)).collect();
        let programs: HashMap<_, _> = HashMap::from_iter(mediators.into_iter().map(|m| {
            (m.clone().unwrap_generator(), search(vec![], m, &model, &self.fun_mor_type))
        }));
        programs
    }

    pub fn build_system<Id: Eq + Clone + Hash + Ord + Debug + std::fmt::Display>(
        &self,
        model: &ModalDblModel<Id, Ustr>,
        filter_id: Option<Id>,
    ) -> PolynomialSystem<Id, Parameter<Id>, u8> {
        let mut flowneg = HashMap::new();
        let mut flowpos = HashMap::new();
        let outpos = model.mor_generators_with_type(&self.outpos_mor_type);
        let outneg = model.mor_generators_with_type(&self.outneg_mor_type);
        let outpos_dom: HashSet<_> = HashSet::from_iter::<_>(
            outpos
                .map(|p| {
                    let dom = model.mor_generator_dom(&p).unwrap_generator();
                    flowpos.insert(dom.clone(), model.mor_generator_cod(&p).unwrap_generator());
                    dom
                })
                .collect::<Vec<_>>(),
        );
        let outneg_dom: HashSet<_> = HashSet::from_iter::<_>(
            outneg
                .map(|p| {
                    let dom = model.mor_generator_dom(&p).unwrap_generator();
                    flowneg.insert(dom.clone(), model.mor_generator_cod(&p).unwrap_generator());
                    dom
                })
                .collect::<Vec<_>>(),
        );

        let mediators: Vec<_> = outpos_dom.intersection(&outneg_dom).cloned().collect();
        let terms: Vec<(Id, Polynomial<Id, Parameter<Id>, u8>)> = mediators
            .iter()
            .filter(|m| match &filter_id {
                Some(k) => *k != **m,
                None => true,
            })
            .map(|mediator| {
                let param = Parameter::generator(mediator.clone());
                let term = Monomial::generator(flowneg[mediator].clone());
                (mediator.clone(), [(param, term)].into_iter().collect())
            })
            .collect();

        let mut sys = PolynomialSystem::new();
        for ob in model.ob_generators_with_type(&self.state_ob_type) {
            sys.add_term(ob, Polynomial::zero());
        }
        for (mediator, term) in terms.iter() {
            sys.add_term(flowneg[&mediator.clone()].clone(), -term.clone());
            sys.add_term(flowpos[&mediator].clone(), term.clone());
        }

        for (var, component) in sys.clone().components.iter() {
            println!("d{var} = {component}")
        }
        println!("--------------------------");

        sys
    }

    pub fn build_switching_system<Id: Eq + Clone + Hash + Ord + Debug + std::fmt::Display>(
        &self,
        model: &ModalDblModel<Id, Ustr>,
    ) -> HashMap<Option<Id>, PolynomialSystem<Id, Parameter<Id>, u8>> {
        let programs = self.comps(model);
        if programs.is_empty() {
            let sys = self.build_system(model, None);
            HashMap::from([(None, sys)])
        } else {
            HashMap::from_iter(programs.into_iter().map(|(k, v)| {
                if v.is_empty() {
                    (None, self.build_system(model, None))
                } else {
                    (Some(v[0].clone()), self.build_system(model, Some(k)))
                }
            }))
        }
    }
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

    #[test]
    fn water_bath() {
        let th = Rc::new(th_modal_state_aux());
        let model = water(th);
        let sys = PetriNetMassActionFunctionAnalysis::default().build_switching_system(&model);
        // dbg!(&sys);
        assert!(true);
    }
}
