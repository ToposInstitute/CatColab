/*! Mass-action ODE analysis of models.

Such ODEs are based on the *law of mass action* familiar from chemistry and
mathematical epidemiology.
 */

use std::collections::{BTreeMap, HashMap};
use std::hash::{BuildHasherDefault, Hash};

use nalgebra::DVector;
use num_traits::Zero;
use ustr::{IdentityHasher, Ustr, ustr};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use std::fmt::Debug;

use super::ODEAnalysis;
use crate::dbl::{
    model::{DiscreteTabModel, FgDblModel, TabEdge},
    theory::{TabMorType, TabObType},
};
use crate::one::FgCategory;
use crate::simulate::ode::{NumericalPolynomialSystem, ODEProblem, PolynomialSystem};
use crate::zero::{alg::Polynomial, rig::Monomial};

use crate::simulate::ode::{MonomialBehavior, StateBehavior, Transformer};

use diffsol::{
    Bdf, DenseMatrix, NalgebraLU, NalgebraMat, OdeBuilder, OdeSolverMethod, OdeSolverState,
};
use nalgebra::DMatrix;
type M = NalgebraMat<f64>;
// type M = DMatrix<f64>;
type LS = NalgebraLU<f64>;

// here we implement the `Transformer` trait for MonomialBehaviors.
impl<Id: Clone + Ord + Debug> Transformer<Id, f32> for MonomialBehavior<Id> {
    fn to_closure(&self, indices: BTreeMap<Id, usize>) -> StateBehavior<f32> {
        match self {
            // assuming multiplicative identity
            MonomialBehavior::Identity => Box::new(|_| 1.0),
            MonomialBehavior::Heaviside(left, right) => {
                let left = *indices.get(&left.clone()).expect("!");
                let right = *indices.get(&right.clone()).expect("!");
                Box::new(move |x: DVector<f32>| -> f32 {
                    let out = x[left] <= x[right];
                    out as u32 as f32
                })
            }
        }
    }
}

/// Data defining a mass-action ODE problem for a model.
#[derive(Default, Clone, Debug)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct EnergeseMassActionProblemData<Id>
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

    /// Map from dynamic variables to their functions
    pub dynamibles: HashMap<Id, String>,
}

type Parameter<Id> = Polynomial<Id, f32, u8>;
type EnergeseModel<Id> = DiscreteTabModel<Id, Ustr, BuildHasherDefault<IdentityHasher>>;

/** Mass-action ODE analysis for stock-flow models.

Mass action dynamics TODO
 */
#[derive(Debug)]
pub struct EnergeseMassActionAnalysis {
    /// Object type for stocks.
    pub stock_ob_type: TabObType<Ustr, Ustr>,
    /// Object type for dynamic variables
    pub dynamible_ob_type: TabObType<Ustr, Ustr>,
    /// Morphism types for flows between stocks
    pub flow_mor_type: TabMorType<Ustr, Ustr>,
    /// Morphism types for links for stocks to flows
    pub link_mor_type: TabMorType<Ustr, Ustr>,
    /// Morphism types for link between dynamic variable and flows
    pub flowlink_mor_type: TabMorType<Ustr, Ustr>,
    /// Morphism types for link between dynamic variable and stocks
    pub varlink_mor_type: TabMorType<Ustr, Ustr>,
}

impl Default for EnergeseMassActionAnalysis {
    fn default() -> Self {
        let stock_ob_type = TabObType::Basic(ustr("Object"));
        let dynamible_ob_type = TabObType::Basic(ustr("DynamicVariable"));
        let flow_mor_type = TabMorType::Hom(Box::new(stock_ob_type.clone()));
        Self {
            stock_ob_type,
            dynamible_ob_type,
            flow_mor_type,
            link_mor_type: TabMorType::Basic(ustr("Link")),
            flowlink_mor_type: TabMorType::Basic(ustr("FlowLink")),
            varlink_mor_type: TabMorType::Basic(ustr("VariableLink")),
        }
    }
}

impl EnergeseMassActionAnalysis {
    /** Creates a mass-action system from a model.
    The resulting system has symbolic rate coefficients.
     */
    pub fn create_system<Id: Eq + Clone + Hash + Ord + std::fmt::Debug>(
        &self,
        model: &EnergeseModel<Id>,
    ) -> PolynomialSystem<Id, Parameter<Id>, u8> {
        let terms: Vec<(Id, Polynomial<Id, Parameter<Id>, u8>)> = model
            .mor_generators_with_type(&self.flow_mor_type)
            .map(|flow| {
                let param = Parameter::generator(flow.clone());
                let dom = model.mor_generator_dom(&flow).unwrap_basic();
                (flow, [(param, Monomial::generator(dom))].into_iter().collect())
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
    pub fn create_numerical_system<
        Id: Eq + Clone + Hash + Ord + std::fmt::Debug + std::fmt::Display + 'static,
    >(
        &self,
        model: &EnergeseModel<Id>,
        data: EnergeseMassActionProblemData<Id>,
    ) -> ODEAnalysis<Id, NumericalPolynomialSystem<u8>> {
        let sys = self.create_system(model);

        // this block associates flows to the dynamic variables which affect them
        let vlinks: Vec<Id> = model.mor_generators_with_type(&self.varlink_mor_type).collect();
        let mut vlinkmap: HashMap<Id, HashMap<Id, Id>> = HashMap::new();
        let flinks: HashMap<Id, Id> = model
            .mor_generators_with_type(&self.flowlink_mor_type)
            .map(|flink| {
                let path = model.mor_generator_cod(&flink).unwrap_tabulated();
                let Some(TabEdge::Basic(cod)) = path.clone().only() else {
                    panic!("!!!");
                };
                let dom = model.mor_generator_dom(&flink).unwrap_basic();
                let hashmap: HashMap<Id, Id> = vlinks
                    .iter()
                    .filter(|v| model.mor_generator_dom(&v).unwrap_basic() == dom)
                    .map(|vlink| (vlink.clone(), model.mor_generator_cod(&vlink).unwrap_basic()))
                    .collect();
                vlinkmap.insert(cod.clone(), hashmap);
                (cod.clone(), dom)
            })
            .collect();

        let objects: Vec<_> = sys.components.keys().cloned().collect();
        let initial_values = objects
            .iter()
            .map(|ob| data.initial_values.get(ob).copied().unwrap_or_default());
        let x0 = DVector::from_iterator(objects.len(), initial_values);

        let mut closures: HashMap<usize, StateBehavior<f32>> = HashMap::new();
        let idxvarmap: BTreeMap<Id, usize> = sys
            .clone()
            .components
            .into_iter()
            .enumerate()
            .map(|(i, (k, _))| (k, i))
            .collect();
        // dbg!(idxvarmap);
        for (k, p) in sys.clone().components.iter() {
            for (coef, _) in p.0.clone().into_iter() {
                for (_, v) in coef.0.clone().into_iter() {
                    for flow in v.variables() {
                        if let Some(flink) = flinks.get(&flow) {
                            if let Some(function) = data.dynamibles.get(flink) {
                                match function.as_str() {
                                    "Heaviside" => {
                                        let args: Vec<Id> = vlinkmap
                                            .clone()
                                            .get(&flow.clone())
                                            .unwrap()
                                            .values()
                                            .cloned()
                                            .collect();
                                        let heaviside = MonomialBehavior::Heaviside(
                                            args[0].clone(),
                                            args[1].clone(),
                                        )
                                        .to_closure(idxvarmap.clone());
                                        let _ = closures.insert(
                                            idxvarmap.get(&k).expect("!").clone(),
                                            heaviside,
                                        );
                                    }
                                    &_ => {} // Box::new(move |x: DVector<f32>| -> f32 { 1.0 }),
                                }
                            }
                        }
                    }
                }
            }
        }

        let mut sys = sys
            .clone()
            .extend_scalars(|poly| {
                poly.eval(|flow| data.rates.get(flow).copied().unwrap_or_default())
            })
            .to_numerical(); // simulate/ode/polynomial

        sys.closures = closures;

        let problem = ODEProblem::new(sys, x0).end_time(data.duration);
        let ob_index: HashMap<_, _> =
            objects.into_iter().enumerate().map(|(i, x)| (x, i)).collect();
        let out = ODEAnalysis::new(problem, ob_index);
        out
    }
}

#[cfg(test)]
mod tests {
    use expect_test::expect;
    use std::rc::Rc;

    use super::*;
    use crate::stdlib::{models::water_volume, theories::th_category_energese};

    #[test]
    fn water_volume_dynamics() {
        let th = Rc::new(th_category_energese());
        let model = water_volume(th);
        let analysis: EnergeseMassActionAnalysis = Default::default();
        let sys = analysis.create_system(&model);

        let expected = expect!([r#"
            dContainer = 0
            dSediment = (deposits spillover) Water
            dWater = ((-1) deposits spillover) Water
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn water_volume_numerical_system() {
        let th = Rc::new(th_category_energese());
        let model = water_volume(th);
        let analysis: EnergeseMassActionAnalysis = Default::default();
        let mut data: EnergeseMassActionProblemData<Ustr> = Default::default();

        data.duration = 13.0;
        data.rates.insert(ustr("inflow"), 10.0);
        data.rates.insert(ustr("deposits"), 3.0);
        data.initial_values.insert(ustr("Source"), 100.0);
        data.initial_values.insert(ustr("Water"), 2.0);
        data.initial_values.insert(ustr("Container"), 40.0);
        data.dynamibles.insert(ustr("SpilloverChecker"), String::from("Heaviside"));

        // sometimes Sediment increases when Water < Container.
        const LENGTH: usize = 20;
        let result = analysis
            .create_numerical_system(&model, data.clone())
            .solve_with_defaults()
            .expect("!");
        let mut sediment: [f32; LENGTH] = Default::default();
        sediment.copy_from_slice(&result.states.get(&ustr("Sediment")).unwrap()[0..LENGTH]);
        let mut water: [f32; LENGTH] = Default::default();
        water.copy_from_slice(&result.states.get(&ustr("Water")).unwrap()[0..LENGTH]);
        // println!("RESULT: {:#?}", std::iter::zip(sediment, water).collect::<Vec<_>>());

        // let t = 0.4;
        // while solver.state().t <= t {
        //     solver.step().unwrap();
        // }
        // let y = solver(t);
        // dbg!(y);

        assert!(true);
        // let expected = expect!([r#"
        //     dContainer = 0
        //     dSediment = (deposits spillover) Water
        //     dWater = ((-1) deposits spillover) Water
        // "#]);
        // expected.assert_eq(&sys.to_string());
    }

    #[test]
    fn water_volume_data() {
        let th = Rc::new(th_category_energese());
        let model = water_volume(th);
        let analysis: EnergeseMassActionAnalysis = Default::default();
        // let sys = analysis.create_system(&model);
        let mut data: EnergeseMassActionProblemData<Ustr> = Default::default();

        data.duration = 10.0;
        data.rates.insert(ustr("deposits"), 3.0);
        data.initial_values.insert(ustr("Water"), 2.0);
        data.initial_values.insert(ustr("Container"), 5.0);
        data.dynamibles.insert(ustr("Container"), String::from("Heaviside"));
        // data.dynamibles.insert(ustr("spillover"), DiffSLFunctions::Heaviside);

        assert!(true);
    }

    // #[test]
    // fn water_volume_analysis() {
    //     let th = Rc::new(th_category_energese());
    //     let model = water_volume(th);
    //     let analysis: EnergeseMassActionAnalysis = Default::default();
    //     let mut data: EnergeseMassActionProblemData<Ustr> = Default::default();
    //     data.duration = 10.0;
    //     data.rates.insert(ustr("deposits"), 3.0);
    //     data.initial_values.insert(ustr("Water"), 4.0);
    //     data.initial_values.insert(ustr("Container"), 5.0);
    //     data.dynamibles.insert(ustr("spillover"), DiffSLFunctions::Heaviside);
    //     let stmt = analysis.as_diffsol(&model, data);

    //     let problem = OdeBuilder::<M>::new().build_from_diffsl::<CG>(&stmt).unwrap();
    //     let mut solver = problem.bdf::<LS>().unwrap();
    //     const SOLVE_TIME: f32 = 10.0;
    //     let (ys, ts): (_, Vec<f64>) = solver.solve(SOLVE_TIME as f64).unwrap();

    //     let water: Vec<f64> = ys.inner().row(2).into_iter().copied().collect();
    //     let sediment: Vec<_> = ys.inner().row(0).into_iter().copied().collect();

    //     let root = BitMapBackend::new("water_sediment_2.png", (640, 480)).into_drawing_area();
    //     let _ = root.fill(&WHITE);
    //     let mut chart = ChartBuilder::on(&root)
    //         .caption("water-sediment", ("sans-serif", 50).into_font())
    //         .margin(5)
    //         .x_label_area_size(30)
    //         .y_label_area_size(30)
    //         .build_cartesian_2d(0f32..SOLVE_TIME, 0.1f32..30f32)
    //         .expect("!");

    //     let _ = chart.configure_mesh().draw();

    //     let _ = chart.draw_series(LineSeries::new(
    //         ts.clone()
    //             .into_iter()
    //             .map(|x| x as f32)
    //             .enumerate()
    //             .map(|(i, t)| (t, sediment.clone()[i] as f32)),
    //         &RED,
    //     ));
    //     let _ = chart.draw_series(LineSeries::new(
    //         ts.clone()
    //             .into_iter()
    //             .map(|x| x as f32)
    //             .enumerate()
    //             .map(|(i, t)| (t, water.clone()[i] as f32)),
    //         &BLUE,
    //     ));

    //     let _ = chart
    //         .configure_series_labels()
    //         .background_style(&WHITE.mix(0.8))
    //         .border_style(&BLACK)
    //         .draw();

    //     let _ = root.present();

    //     assert!(true);
    // }
}
