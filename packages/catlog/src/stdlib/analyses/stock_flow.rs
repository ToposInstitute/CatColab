//! Stock-flow semantics for models.

use std::collections::HashMap;

use crate::{
    dbl::model::*,
    one::{fin_category::FinMor, FinGraph, Graph, SkelGraph},
    zero::{compile, run, Context, Env, Prog},
};
use nalgebra::DVector;
use ode_solvers::{Rk4, System};
use textplots::*;
use ustr::Ustr;

/// An extension for doing stock-flow simulations
pub struct StockFlowExtension {
    /// A map from flow id to a flow expression for that flow, which should be an arithmetic
    /// expression in the stock variables.
    flow_expressions: HashMap<Ustr, String>,
    /// The initial values of each stock
    initial_values: HashMap<Ustr, f32>,
    /// The length of time that we should run the simulation for
    simulation_length: f32,
    /// The object type in the double theory, the corresponding objects of which should be
    /// interpretted as stocks
    stock_object: Ustr,
    /// The morphism type in the double theory, the corresponding morphisms of which should be
    /// interpretted as flows
    flow_morphism: FinMor<Ustr, Ustr>,
}

impl StockFlowExtension {
    /// Create a new StockFlow extension
    pub fn new(
        flow_expressions: HashMap<Ustr, String>,
        initial_values: HashMap<Ustr, f32>,
        simulation_length: f32,
        stock_object: Ustr,
        flow_morphism: FinMor<Ustr, Ustr>,
    ) -> Self {
        Self {
            flow_expressions,
            initial_values,
            simulation_length,
            stock_object,
            flow_morphism,
        }
    }

    /// Check that self is compatible with model, e.g. there is a flow expression for every flow
    /// and so on.
    pub fn validate(&self, model: &UstrDiscreteDblModel) -> bool {
        self.compile_system(model).is_ok()
    }

    /// Compile all of the expressions (parse and lookup the variables),
    ///
    /// TODO: this should take a previous StockFlowSystem, and not recompile the expressions if
    /// the expressions have not changes, only update initial conditions etc.
    /// TODO: before doing the above, benchmark to see if compiling expressions is actually at all
    /// expensive.
    pub fn compile_system(&self, model: &UstrDiscreteDblModel) -> Result<StockFlowSystem, String> {
        let mut stocks = model.object_generators_with_type(&self.stock_object).collect::<Vec<_>>();
        stocks.sort();
        let idx_lookup = stocks
            .iter()
            .enumerate()
            .map(|(i, n)| (*n, i))
            .collect::<HashMap<Ustr, usize>>();
        let generators = model.generating_graph();
        let mut graph: SkelGraph = Default::default();
        graph.add_vertices(stocks.len());
        let mut flows =
            model.morphism_generators_with_type(&self.flow_morphism).collect::<Vec<_>>();
        flows.sort();
        for flow in flows.iter() {
            graph.add_edge(
                *idx_lookup.get(&generators.src(&flow)).unwrap(),
                *idx_lookup.get(&generators.tgt(&flow)).unwrap(),
            );
        }
        let ctx = Context::from(idx_lookup);
        let flow_progs = flows
            .iter()
            .map(|name| {
                let src = self.flow_expressions.get(name)?;
                compile(&ctx, src.as_str()).ok()
            })
            .collect::<Option<Vec<Prog<usize>>>>()
            .unwrap();
        let initial_values = stocks
            .iter()
            .map(|s| *self.initial_values.get(s).unwrap())
            .collect::<Vec<_>>()
            .into();
        Ok(StockFlowSystem {
            graph,
            stock_names: stocks,
            initial_values,
            flow_progs,
            end_time: self.simulation_length,
        })
    }
}

/// The compiled version of a StockFlowExtension + model. Has all the data needed to compute the
/// vector field.
pub struct StockFlowSystem {
    graph: SkelGraph,
    initial_values: DVector<f32>,
    stock_names: Vec<Ustr>,
    flow_progs: Vec<Prog<usize>>,
    end_time: f32,
}

struct DVectorEnv<'a>(&'a DVector<f32>);

impl<'a> Env for DVectorEnv<'a> {
    type Var = usize;

    fn lookup(&self, t: &Self::Var) -> f32 {
        self.0[*t]
    }
}

impl System<f32, DVector<f32>> for &StockFlowSystem {
    fn system(&self, _x: f32, y: &DVector<f32>, dy: &mut DVector<f32>) {
        let env = DVectorEnv(y);
        let flows = self.flow_progs.iter().map(|p| run(&env, p)).collect::<Vec<_>>();
        for i in self.graph.vertices() {
            dy[i] = self.graph.in_edges(&i).map(|j| flows[j]).sum::<f32>()
                - self.graph.out_edges(&i).map(|j| flows[j]).sum::<f32>();
        }
    }
}

impl StockFlowSystem {
    /// Solve the ODE given by the system's vector field and initial conditions, and produce an
    /// ASCII text plot of the solution.
    pub fn plot(&self) -> String {
        let mut stepper = Rk4::new(self, 0.0, self.initial_values.clone(), self.end_time, 0.1);

        stepper.integrate().unwrap();

        let mut chart = Chart::new(100, 80, 0.0, self.end_time);

        let mut line_data = Vec::new();

        for (i, _stock) in self.stock_names.iter().enumerate() {
            line_data.push(
                stepper
                    .x_out()
                    .iter()
                    .copied()
                    .zip(stepper.y_out().iter().map(|y| y[i]))
                    .collect::<Vec<_>>(),
            );
        }

        let mut lines = Vec::new();

        for (i, _stock) in self.stock_names.iter().enumerate() {
            lines.push(Shape::Lines(&line_data[i]))
        }

        let chart = lines.iter().fold(&mut chart, |c, l| c.lineplot(l));

        chart.axis();
        chart.figures();

        format!("{}", chart)
    }
}

#[cfg(test)]
mod test {
    use std::{collections::HashMap, sync::Arc};

    use ustr::ustr;

    use crate::{one::fin_category::FinMor, stdlib};

    use super::{StockFlowExtension, UstrDiscreteDblModel};
    use expect_test::expect;

    #[test]
    fn sir_stock_flow() {
        let stock_flow_theory = Arc::new(stdlib::theories::th_category());
        let mut sir = UstrDiscreteDblModel::new(stock_flow_theory);
        sir.add_ob(ustr("S"), ustr("Object"));
        sir.add_ob(ustr("I"), ustr("Object"));
        sir.add_ob(ustr("R"), ustr("Object"));
        sir.add_mor(ustr("inf"), ustr("S"), ustr("I"), FinMor::Id(ustr("Object")));
        sir.add_mor(ustr("rec"), ustr("I"), ustr("R"), FinMor::Id(ustr("Object")));

        let extension = StockFlowExtension {
            flow_expressions: [(ustr("inf"), "S * I".to_string()), (ustr("rec"), "I".to_string())]
                .into_iter()
                .collect::<HashMap<_, _>>(),
            initial_values: [(ustr("S"), 4.0), (ustr("I"), 1.0), (ustr("R"), 0.0)]
                .into_iter()
                .collect::<HashMap<_, _>>(),
            simulation_length: 5.0,
            stock_object: ustr("Object"),
            flow_morphism: FinMor::Id(ustr("Object")),
        };

        let system = extension.compile_system(&sir).unwrap();

        let expected = expect![[r#"
            ⡁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣀⠤⠤⠤⠒⠒⠒⠒⠒⠉⠉⠉⠉⠁ 4.9
            ⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⠤⠒⠒⠉⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⠤⠒⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠤⠊⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⢇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡠⠒⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠚⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡠⠊⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⢣⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠎⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⠘⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡔⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⢣⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠎⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⠘⡄⠀⢀⠤⠒⠤⡀⠀⢠⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⠀⠀⢣⡔⠁⠀⠀⠀⠈⢦⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠀⡜⡄⠀⠀⠀⠀⢠⠃⠑⢄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⡸⠀⢣⠀⠀⠀⢠⠃⠀⠀⠀⠣⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠄⢠⠃⠀⠘⡄⠀⢠⠃⠀⠀⠀⠀⠀⠈⠢⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⢂⠇⠀⠀⠀⠱⣠⠃⠀⠀⠀⠀⠀⠀⠀⠀⠈⠢⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡝⠀⠀⠀⠀⢠⢣⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠢⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠅⠀⠀⠀⢠⠃⠀⢣⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠑⠤⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⠂⠀⠀⢠⠃⠀⠀⠀⠣⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠒⠤⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⡁⠀⡠⠃⠀⠀⠀⠀⠀⠈⠒⠤⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠒⠒⠤⠤⣀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
            ⢄⠔⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠒⠒⠤⠤⠤⠤⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣉⣉⣒⣒⣒⣒⣤⣤⣤⣤⠤⣀⣀⣀⣀⡀
            ⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠁⠈⠀⠉⠉⠉⠉⠉⠁ 0.0
            0.0                                            5.0
        "#]];
        expected.assert_eq(&system.plot())
    }
}
