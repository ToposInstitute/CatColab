/*! Mass-action ODE analysis of models.

Such ODEs are based on the *law of mass action* familiar from chemistry and
mathematical epidemiology.
 */

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fmt::{Debug, Display};
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
    model::{DiscreteTabModel, FgDblModel, ModalDblModel, ModalOb, MutDblModel, TabEdge},
    theory::{ModalMorType, ModalObType, ModeApp, TabMorType, TabObType},
};
use crate::one::{FgCategory, FinGraph, HashGraph};
use crate::simulate::ode::{
    NumericalPolynomialSwitchingSystem, NumericalPolynomialSystem, ODEProblem, PolynomialSystem,
};
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

// trait Evaluable<T> {
//     type Output;
//     fn eval(&self) -> Self::Output;
// }

// pub struct GeqFunction<T>(T, T);
// pub struct IdentityFunction<T>(T);

// impl<T: PartialOrd> Evaluable<T> for GeqFunction<T> {
//     type Output = bool;

//     fn eval(&self) -> Self::Output {
//         self.0 >= self.1
//     }
// }

// impl<T> Evaluable<T> for IdentityFunction<T>
// where
//     T: Clone,
// {
//     type Output = T;

//     fn eval(&self) -> Self::Output {
//         self.0.clone()
//     }
// }

// pub enum EligibleFunctions<Y> {
//     Geq(Y),
//     Identity(Y),
// }

// impl<T> EligibleFunctions<Y> where T: PartialOrd {
//     pub fn eval(&self, args: Vec<T>) -> Y {

#[derive(Debug)]
pub enum Output {
    Bool(bool),
    Float(f32),
}

#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub enum EligibleFunctions {
    Geq(),
    Identity(),
}

impl EligibleFunctions {
    pub fn eval(self, args: &Vec<f32>) -> Output {
        match self {
            EligibleFunctions::Geq() => Output::Bool(args[0] >= args[1]),
            EligibleFunctions::Identity() => Output::Float(args[0]),
        }
    }
}

/// Data defining a mass-action ODE problem for a model with function parameters
#[derive(Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct SwitchingMassActionProblemData<Id>
where
    Id: Eq + Hash + Clone + Debug,
{
    /// mass action problem data
    pub mass: MassActionProblemData<Id>,

    /// functions associated to T(aux) --> aux
    pub functions: HashMap<Id, EligibleFunctions>,
}

#[derive(Debug, Clone)]
pub struct ComputeGraph<Id>
where
    Id: Clone + Eq + Hash + Debug,
{
    /// compute graph
    pub graph: HashGraph<Id, String>, // TODO parameterize edge type

    pub obs: Vec<Id>,

    pub funcs: HashMap<Id, Vec<Id>>,

    pub auxes: HashMap<Id, f32>,

    pub borrows: HashMap<Id, Id>,

    // /// in-ports

    // /// out-ports
    // inp
    ///
    pub toposort: Vec<Id>,
}

impl<Id: Eq + Hash + Clone + Debug> ComputeGraph<Id> {
    pub fn new() -> Self {
        Self {
            graph: HashGraph::<Id, String>::default(),
            obs: Vec::<Id>::new(),
            auxes: HashMap::<Id, f32>::new(),
            funcs: HashMap::<Id, Vec<Id>>::new(), // store inputs
            borrows: HashMap::<Id, Id>::new(),
            toposort: vec![],
        }
    }

    // TODO need to verify that arrow is an arrow. Otherwise, return an identity function
    // XXX update this
    /// This extracts a compute graph associated to an arrow in a model.
    pub fn complete(model: &ModalDblModel<Id, Ustr>, arrow: Id) -> Self {
        let mut cg = ComputeGraph::<Id>::new();
        match model.mor_generator_dom(&arrow.clone()) {
            ModalOb::Generator(id) => {
                cg.add_vertex(arrow.clone());
                cg.add_vertex(id.clone());
                cg.connect(id, arrow.clone());
            }
            ModalOb::List(_, xs) => {
                cg.add_vertex(arrow.clone());
                for x in xs {
                    // TODO `x` may not be Generator
                    cg.add_vertex(x.clone().unwrap_generator());
                    cg.connect(x.clone().unwrap_generator(), arrow.clone());
                }
            }
            _ => todo!(),
        }
        match model.mor_generator_cod(&arrow) {
            ModalOb::Generator(id) => {
                cg.add_vertex(arrow.clone());
                cg.add_vertex(id.clone());
                cg.connect(arrow.clone(), id.clone());
            }
            ModalOb::List(_, xs) => {
                cg.add_vertex(arrow.clone());
                for x in xs {
                    // TODO `x` may not be Generator
                    cg.add_vertex(x.clone().unwrap_generator());
                    cg.connect(arrow.clone(), x.unwrap_generator());
                }
            }
            _ => todo!(),
        }

        cg.toposort = crate::one::graph_algorithms::toposort(&cg.graph).expect("!");
        cg
    }

    pub fn add_vertex(&mut self, v: Id) -> bool {
        self.graph.add_vertex(v)
    }

    pub fn add_edge(&mut self, e: String, dom: Id, cod: Id) -> bool {
        self.graph.add_edge(e, dom, cod)
    }

    // TODO check that the name exists?
    /// Connects a src and tgt by an edge whose name is generated automatically.
    pub fn connect(&mut self, dom: Id, cod: Id) -> bool {
        self.graph.add_edge(format!("{:?}=>{:?}", dom.clone(), cod.clone()), dom, cod)
    }
}

#[derive(Clone)]
pub struct SwitchingSystem<Id>
where
    Id: Eq + Clone + Hash + Debug,
{
    pub null_model: PolynomialSystem<Id, Parameter<Id>, u8>,
    pub subsystems: Vec<(ComputeGraph<Id>, PolynomialSystem<Id, Parameter<Id>, u8>)>,
    pub ob_index: BTreeMap<Id, usize>,
}

impl<Id> SwitchingSystem<Id>
where
    Id: Hash + Clone + Eq + Ord + Debug,
{
    pub fn to_numerical(
        &self,
        functions: HashMap<Id, EligibleFunctions>,
    ) -> NumericalPolynomialSwitchingSystem<Id, u8> {
        let subsystems: Vec<(ComputeGraph<Id>, _)> = self
            .subsystems
            .clone()
            .into_iter()
            .map(|(id, poly)| (id, poly.extend_scalars(|p| p.eval(|_| 1.0)).to_numerical()))
            .collect();
        // TODO option is used here to avoid implementing Default.
        let null_model =
            Some(self.null_model.clone().extend_scalars(|p| p.eval(|_| 1.0)).to_numerical());
        NumericalPolynomialSwitchingSystem {
            ob_index: self.ob_index.clone(),
            functions,
            null_model,
            subsystems,
        }
    }
}

/// Convenience struct
#[derive(Clone, Debug)]
pub struct PetriNetSystemData<Id>
where
    Id: Eq + Clone + Hash + Debug,
{
    pub flowneg: HashMap<Id, Id>,
    pub flowpos: HashMap<Id, Id>,
    pub outpos_dom: HashSet<Id>,
    pub outneg_dom: HashSet<Id>,
    pub mediators: Vec<Id>,
}

impl<Id> PetriNetSystemData<Id>
where
    Id: Hash + Eq + Clone + Debug,
{
    fn make(model: &ModalDblModel<Id, Ustr>, pna: &PetriNetMassActionFunctionAnalysis) -> Self {
        let mut flowneg = HashMap::new();
        let mut flowpos = HashMap::new();
        let outpos_dom: HashSet<_> = HashSet::from_iter::<_>(
            model
                .mor_generators_with_type(&pna.outpos_mor_type)
                .map(|p| {
                    let dom = model.mor_generator_dom(&p).unwrap_generator();
                    flowpos.insert(dom.clone(), model.mor_generator_cod(&p).unwrap_generator());
                    dom
                })
                .collect::<Vec<_>>(),
        );
        let outneg_dom: HashSet<_> = HashSet::from_iter::<_>(
            model
                .mor_generators_with_type(&pna.outneg_mor_type)
                .map(|p| {
                    let dom = model.mor_generator_dom(&p).unwrap_generator();
                    flowneg.insert(dom.clone(), model.mor_generator_cod(&p).unwrap_generator());
                    dom
                })
                .collect::<Vec<_>>(),
        );
        let mediators: Vec<_> = outpos_dom.intersection(&outneg_dom).cloned().collect();

        Self {
            flowneg,
            flowpos,
            outpos_dom,
            outneg_dom,
            mediators,
        }
    }
}

// TODO rename
/**
 */
pub struct PetriNetMassActionFunctionAnalysis {
    /// Object type for states
    pub state_ob_type: ModalObType<Ustr>,
    /// Object type for auxiliary variables
    pub aux_ob_type: ModalObType<Ustr>,
    /// Morphism type for functions between auxiliary variables
    pub fun_mor_type: ModalMorType<Ustr>,
    /// Morphism type for "borrowing," or maps from states to auxiliary variables
    pub borrow_mor_type: ModalMorType<Ustr>,
    /// Morphism type for positively-signed flows
    pub outpos_mor_type: ModalMorType<Ustr>,
    /// Morphism type for negatively-signed flows
    pub outneg_mor_type: ModalMorType<Ustr>,
}

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
    fn build_graph<Id: Clone + Eq + Hash + Debug>(
        &self,
        model: &ModalDblModel<Id, Ustr>,
    ) -> ComputeGraph<Id> {
        let mut cg = ComputeGraph::<Id>::new();
        cg.obs = model.ob_generators_with_type(&self.state_ob_type).collect::<Vec<Id>>();
        // TODO these should just be auxes entering the graph
        cg.auxes = HashMap::from_iter(
            model.ob_generators_with_type(&self.aux_ob_type).map(|aux| (aux, 4.5f32)),
        );
        cg.borrows =
            HashMap::from_iter(model.mor_generators_with_type(&self.borrow_mor_type).map(|f| {
                (
                    model.mor_generator_cod(&f.clone()).unwrap_generator(),
                    model.mor_generator_dom(&f.clone()).unwrap_generator(),
                )
            }));
        let arrows = model.mor_generators_with_type(&self.fun_mor_type).collect::<Vec<_>>();
        for arrow in arrows {
            let mut inputs: Vec<Id> = vec![];
            match model.mor_generator_dom(&arrow) {
                ModalOb::Generator(id) => {
                    inputs.push(id.clone());
                    cg.add_vertex(arrow.clone());
                    cg.add_vertex(id.clone());
                    cg.connect(id, arrow.clone());
                }
                ModalOb::List(_, xs) => {
                    cg.add_vertex(arrow.clone());
                    for x in xs {
                        inputs.push(x.clone().unwrap_generator());
                        // TODO `x` may not be Generator
                        cg.add_vertex(x.clone().unwrap_generator());
                        cg.connect(x.clone().unwrap_generator(), arrow.clone());
                    }
                }
                _ => todo!(),
            }
            cg.funcs.insert(arrow.clone(), inputs);
            //
            match model.mor_generator_cod(&arrow) {
                ModalOb::Generator(id) => {
                    cg.add_vertex(arrow.clone());
                    cg.add_vertex(id.clone());
                    cg.connect(arrow.clone(), id.clone());
                }
                ModalOb::List(_, xs) => {
                    cg.add_vertex(arrow.clone());
                    for x in xs {
                        // TODO `x` may not be Generator
                        cg.add_vertex(x.clone().unwrap_generator());
                        cg.connect(arrow.clone(), x.unwrap_generator());
                    }
                }
                _ => todo!(),
            }
        }

        cg.toposort = crate::one::graph_algorithms::toposort(&cg.graph).expect("!");
        cg
    }

    pub fn build_system<Id>(
        &self,
        model: &ModalDblModel<Id, Ustr>,
        model_data: PetriNetSystemData<Id>, // TODO rename
        filter_ids: Vec<Id>,
    ) -> PolynomialSystem<Id, Parameter<Id>, u8>
    where
        Id: Eq + Clone + Hash + Debug + Ord + Display,
    {
        // TODO what are these
        let terms: Vec<(Id, Polynomial<Id, Parameter<Id>, u8>)> = model_data
            .mediators
            .iter()
            // keep the mediator if it is in the list
            .filter(|m| filter_ids.clone().contains(m))
            .map(|mediator| {
                let param = Parameter::generator(mediator.clone());
                let term = Monomial::generator(model_data.flowneg[mediator].clone());
                (mediator.clone(), [(param, term)].into_iter().collect())
            })
            .collect();

        let mut sys = PolynomialSystem::new();
        for ob in model.ob_generators_with_type(&self.state_ob_type) {
            sys.add_term(ob, Polynomial::zero());
        }
        // TODO
        for (mediator, term) in terms.iter() {
            sys.add_term(model_data.flowneg[&mediator.clone()].clone(), -term.clone());
            sys.add_term(model_data.flowpos[&mediator].clone(), term.clone());
        }

        for (var, component) in sys.clone().components.iter() {
            println!("d{var} = {component}")
        }
        println!("--------------------------");

        sys
    }

    pub fn build_switching_system<Id>(&self, model: &ModalDblModel<Id, Ustr>) -> SwitchingSystem<Id>
    where
        Id: Clone + Eq + Hash + Debug + Ord + Display,
    {
        let modeldata = PetriNetSystemData::make(model.into(), &self);

        // TODO ensure they are connected components
        let programs = self.build_graph(model);

        // build subsystem with no programs.
        // This means we exclude all flows are are mediated by
        // any program
        let affected_mediators = modeldata
            .clone()
            .mediators
            .into_iter()
            .filter(|m| programs.graph.vertices().contains(m));
        let init_model = self.build_system(
            &model,
            modeldata.clone(),
            modeldata
                .clone()
                .mediators
                .into_iter()
                .filter(|m| !programs.graph.vertices().contains(m))
                .collect::<Vec<_>>(),
        );
        let null_model = self.build_system(&model, modeldata.clone(), vec![]);
        let mut subsystems = affected_mediators
            .map(|m| {
                let sys = self.build_system(&model, modeldata.clone(), vec![m]);
                (programs.clone(), sys)
            })
            .collect::<Vec<(ComputeGraph<Id>, PolynomialSystem<Id, Parameter<Id>, u8>)>>();
        subsystems.push((ComputeGraph::<Id>::new(), init_model));
        let ob_index: BTreeMap<Id, usize> =
            null_model.components.keys().cloned().enumerate().map(|(i, x)| (x, i)).collect();
        SwitchingSystem {
            null_model,
            subsystems,
            ob_index,
        }
    }

    pub fn build_numerical_system<Id: Eq + Clone + Hash + Ord + Debug + std::fmt::Display>(
        &self,
        model: &ModalDblModel<Id, Ustr>,
        data: SwitchingMassActionProblemData<Id>,
    ) -> ODEAnalysis<Id, NumericalPolynomialSwitchingSystem<Id, u8>> {
        // XXX we forget some data from `data` here
        into_numerical_switching_system(self.build_switching_system(model), data)
    }
}

fn into_numerical_switching_system<Id: Eq + Clone + Hash + Ord + Debug>(
    system: SwitchingSystem<Id>,
    data: SwitchingMassActionProblemData<Id>,
) -> ODEAnalysis<Id, NumericalPolynomialSwitchingSystem<Id, u8>> {
    let ob_index: BTreeMap<_, _> = system.ob_index.clone();
    let n = ob_index.len();
    let null_model =
        Some(system.null_model.clone().extend_scalars(|p| p.eval(|_| 1.0)).to_numerical());
    let initial_values = ob_index
        .keys()
        .map(|ob| data.mass.initial_values.get(ob).copied().unwrap_or_default());
    let x0 = DVector::from_iterator(n, initial_values);
    let subsystems = system
        .subsystems
        .into_iter()
        .map(|(graph, sys)| {
            let sys = sys
                .extend_scalars(|poly| {
                    poly.eval(|flow| data.mass.rates.get(flow).copied().unwrap_or_default())
                })
                .to_numerical();
            (graph, sys)
        })
        .collect::<Vec<_>>();
    let sys = NumericalPolynomialSwitchingSystem {
        ob_index: ob_index.clone(),
        subsystems,
        null_model,
        functions: data.functions,
    };
    let problem = ODEProblem::new(sys, x0).end_time(data.mass.duration);
    ODEAnalysis {
        problem,
        variable_index: ob_index,
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

    #[test]
    fn graph() {
        let th = Rc::new(th_modal_state_aux());
        let model = water(th);
        let sys = PetriNetMassActionFunctionAnalysis::default().build_switching_system(&model);
        // dbg!(&sys);
        assert!(true);
    }
}
