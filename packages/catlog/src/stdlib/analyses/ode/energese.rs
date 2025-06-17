/*! Mass-action ODE analysis of models.

Such ODEs are based on the *law of mass action* familiar from chemistry and
mathematical epidemiology.
 */

use std::collections::HashMap;
use std::hash::{BuildHasherDefault, Hash};

use nalgebra::DVector;
use num_traits::Zero;
use ustr::{ustr, IdentityHasher, Ustr};

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
use crate::zero::{alg::Polynomial, rig::Monomial};

use diffsol::{
    CraneliftJitModule, MatrixCommon, OdeBuilder, OdeSolverMethod, OdeSolverStopReason, Vector,
};
use diffsol::{NalgebraMat, OdeEquationsImplicit, OdeSolverProblem};
type M = diffsol::NalgebraMat<f64>;
type CG = CraneliftJitModule;
type LS = diffsol::NalgebraLU<f64>;
use plotters::prelude::*;

/// Data defining a mass-action ODE problem for a model.
#[derive(Clone)]
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
    dynamibles: HashMap<Id, f32>,
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
        // build flow links first
        let vlinks: Vec<Id> = model.mor_generators_with_type(&self.varlink_mor_type).collect();
        // snd are pairs of outgoing vlinks and their cods for dom(fst)
        let mut vlinkmap: HashMap<Id, HashMap<Id, Id>> = HashMap::new();
        let flinks: HashMap<Id, Monomial<Id, u8>> = model
            .mor_generators_with_type(&self.flowlink_mor_type)
            .map(|flink| {
                let path = model.mor_generator_cod(&flink).unwrap_tabulated();
                let Some(TabEdge::Basic(cod)) = path.clone().only() else {
                    panic!("!!!");
                };
                // vlink stuff
                let dom = model.mor_generator_dom(&flink).unwrap_basic();
                let hashmap: HashMap<Id, Id> = vlinks
                    .iter()
                    .filter(|v| model.mor_generator_dom(&v).unwrap_basic() == dom)
                    .map(|vlink| (vlink.clone(), model.mor_generator_cod(&vlink).unwrap_basic()))
                    .collect();
                vlinkmap.insert(flink.clone(), hashmap);
                // return pair
                (cod.clone(), Monomial::generator(flink))
            })
            .collect();

        let terms: HashMap<Id, Monomial<Id, u8>> = model
            .mor_generators_with_type(&self.flow_mor_type)
            .map(|flow| {
                let dom = model.mor_generator_dom(&flow).unwrap_basic();
                (flow, Monomial::generator(dom))
            })
            .collect();

        let terms: Vec<(Id, Polynomial<Id, Parameter<Id>, u8>)> = terms
            .into_iter()
            .map(|(flow, term)| {
                let param = Parameter::generator(flow.clone());

                if let Some(flink) = flinks.get(&flow) {
                    (
                        flow,
                        [(param * Polynomial::from_monomial(flink.clone()), term)]
                            .into_iter()
                            .collect(),
                    )
                } else {
                    (flow, [(param, term)].into_iter().collect())
                }
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
    pub fn create_numerical_system<Id: Eq + Clone + Hash + Ord + std::fmt::Debug>(
        &self,
        model: &EnergeseModel<Id>,
        data: EnergeseMassActionProblemData<Id>,
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

    /**
     */
    pub fn to_diffsol<Id: Eq + Clone + Hash + Ord + std::fmt::Debug>(
        &self,
        model: &EnergeseModel<Ustr>,
        // _data: EnergeseMassActionProblemData<Id>,
    ) -> String {
        let sys = self.create_system(model);
        println!("{:#?}", sys.components);
        println!("{:#?}", sys.components.get(&ustr::Ustr::from("Water")));
        let mut s = String::new();
        for (_, c) in sys.components.iter() {
            s.push_str(&format!("{}\n", c))
        }

        let objects: Vec<_> = sys.components.keys().cloned().collect();
        // let initial_values = objects
        // .iter()
        // .map(|ob| data.initial_values.get(ob).copied().unwrap_or_default());
        println!("{:#?}", objects);
        // println!("{:#?}", initial_values);
        format!(
            "
            u_i {{ {} }}
            F_i {{ {} }}
        ",
            "init", "rhs"
        )
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

        let _ = analysis.to_diffsol::<Ustr>(&model);
        let expected = expect!([r#"
            dContainer = 0
            dSediment = (deposits spillover) Water
            dWater = ((-1) deposits spillover) Water
            spillover = SpilloverChecker (left - right)
        "#]);
        expected.assert_eq(&sys.to_string());
    }

    // TODO add Heaviside
    #[test]
    fn water_volume_analysis() {
        let th = Rc::new(th_category_energese());
        let model = water_volume(th);
        let analysis: EnergeseMassActionAnalysis = Default::default();
        let sys = analysis.create_system(&model);

        // TODO: borrow `fmt` and then interpolate initial data
        let stmt = r"
            u_i { 
                C = 10,
                W = 2,
                S = 0 
            }
            F_i {
                0,
                -1*heaviside(W-C)*W,
                heaviside(W-C)*W 
            }
        ";
        let problem = OdeBuilder::<M>::new().build_from_diffsl::<CG>(stmt).unwrap();
        let mut solver = problem.bdf::<LS>().unwrap();
        let (ys, ts): (_, Vec<f64>) = solver.solve(60.0).unwrap();

        let water: Vec<f64> = ys.inner().row(1).into_iter().copied().collect();
        let sediment: Vec<_> = ys.inner().row(2).into_iter().copied().collect();

        let root = BitMapBackend::new("water_sediment.png", (640, 480)).into_drawing_area();
        let _ = root.fill(&WHITE);
        let mut chart = ChartBuilder::on(&root)
            .caption("water-sediment", ("sans-serif", 50).into_font())
            .margin(5)
            .x_label_area_size(30)
            .y_label_area_size(30)
            .build_cartesian_2d(0f32..40f32, 0.1f32..30f32)
            .expect("!");

        let _ = chart.configure_mesh().draw();

        let _ = chart.draw_series(LineSeries::new(
            ts.clone()
                .into_iter()
                .map(|x| x as f32)
                .enumerate()
                .map(|(i, t)| (t, water.clone()[i] as f32)),
            &BLUE,
        ));
        let _ = chart.draw_series(LineSeries::new(
            ts.into_iter()
                .map(|x| x as f32)
                .enumerate()
                .map(|(i, t)| (t, sediment.clone()[i] as f32)),
            &RED,
        ));
        // .legend(|(x, y)| PathElement::new(vec![(x, y), (x + 20, y)], &RED));

        let _ = chart
            .configure_series_labels()
            .background_style(&WHITE.mix(0.8))
            .border_style(&BLACK)
            .draw();

        let _ = root.present();

        // println!("{:#?}", water);
        // println!("{:#?}", sediment);

        assert!(true);
    }
}
