//! ODE semantics for stock and flow diagrams.

use std::collections::HashMap;
use thiserror::Error;

use nalgebra::DVector;
use ustr::Ustr;

use crate::dbl::model::*;
use crate::one::{fin_category::FinMor, FgCategory, FinGraph, SkelGraph};
use crate::simulate::{
    mathexpr::{self, compile, run, Context, Env, Prog},
    ode::{ODEProblem, ODESystem},
};

/// A validation error for an ODE analysis of a stock-flow model.
#[derive(Debug, Error)]
pub enum Error {
    /// An error in compiling a flow expression
    #[error("compilation error in the flow expression for {flow}: {}",
            mathexpr::WithSource::new(.flow_expression, .errors))]
    FlowExpressionCompilation {
        /// The flow that the expression is attached to
        flow: Ustr,
        /// The source code of the expression
        flow_expression: String,
        /// The compilation errors
        errors: mathexpr::Errors,
    },

    /// A flow that is missing a flow expression
    #[error("missing flow expression for {flow}")]
    MissingFlowExpression {
        /// The flow
        flow: Ustr,
    },

    /// A stock that is missing an initial value
    #[error("missing initial value for stock {stock}")]
    MissingInitialValue {
        /// The stock
        stock: Ustr,
    },
}

/// Configuration for an ODE analysis of a stock-flow model.
pub struct StockFlowODEAnalysis {
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

impl StockFlowODEAnalysis {
    /// Create a new stock-flow ODE analysis.
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
    pub fn compile_system(
        &self,
        model: &UstrDiscreteDblModel,
    ) -> Result<ODEProblem<StockFlowSystem>, Vec<Error>> {
        let mut graph: SkelGraph = Default::default();

        let mut stocks = model.ob_generators_with_type(&self.stock_object).collect::<Vec<_>>();
        stocks.sort();
        let vertex_lookup = stocks
            .iter()
            .enumerate()
            .map(|(i, n)| (*n, i))
            .collect::<HashMap<Ustr, usize>>();
        graph.add_vertices(stocks.len());

        let mut flows = model.mor_generators_with_type(&self.flow_morphism).collect::<Vec<_>>();
        flows.sort();
        for flow in flows.iter() {
            graph.add_edge(
                *vertex_lookup.get(&model.morphism_generator_dom(flow)).unwrap(),
                *vertex_lookup.get(&model.morphism_generator_cod(flow)).unwrap(),
            );
        }

        let ctx = Context::from(vertex_lookup);
        let mut errors = Vec::new();

        let mut flow_progs = Vec::new();

        for flow in flows.iter() {
            match self.flow_expressions.get(flow) {
                Some(src) => match compile(&ctx, src.as_str()) {
                    Ok(prog) => flow_progs.push(prog),
                    Err(compilation_errors) => errors.push(Error::FlowExpressionCompilation {
                        flow: *flow,
                        flow_expression: src.clone(),
                        errors: compilation_errors,
                    }),
                },
                None => errors.push(Error::MissingFlowExpression { flow: *flow }),
            }
        }

        let mut initial_values = Vec::new();

        for stock in stocks.iter() {
            match self.initial_values.get(stock) {
                Some(v) => initial_values.push(*v),
                None => errors.push(Error::MissingInitialValue { stock: *stock }),
            }
        }

        if errors.is_empty() {
            let system = StockFlowSystem {
                graph,
                stock_names: stocks,
                flow_progs,
            };
            Ok(ODEProblem::new(system, initial_values.into()).end_time(self.simulation_length))
        } else {
            Err(errors)
        }
    }
}

/** An ODE system for a stock-flow diagram.

The result of compiling a `StockFlowODEAnalysis` for a particular model. Has all
the data needed to compute the vector field for the ODE.
 */
pub struct StockFlowSystem {
    graph: SkelGraph,
    #[allow(dead_code)]
    stock_names: Vec<Ustr>,
    flow_progs: Vec<Prog<usize>>,
}

struct DVectorEnv<'a>(&'a DVector<f32>);

impl Env for DVectorEnv<'_> {
    type Var = usize;

    fn lookup(&self, t: &Self::Var) -> f32 {
        self.0[*t]
    }
}

impl ODESystem for StockFlowSystem {
    fn vector_field(&self, dy: &mut DVector<f32>, y: &DVector<f32>, _: f32) {
        let env = DVectorEnv(y);
        let flows = self.flow_progs.iter().map(|p| run(&env, p)).collect::<Vec<_>>();
        for i in self.graph.vertices() {
            dy[i] = self.graph.in_edges(&i).map(|j| flows[j]).sum::<f32>()
                - self.graph.out_edges(&i).map(|j| flows[j]).sum::<f32>();
        }
    }
}

#[cfg(test)]
mod test {
    use std::{collections::HashMap, sync::Arc};

    use expect_test::{expect, Expect};
    use textplots::*;
    use ustr::ustr;

    use super::*;
    use crate::simulate::ode::ODEProblem;
    use crate::{one::fin_category::FinMor, stdlib};

    fn plot(problem: &ODEProblem<StockFlowSystem>) -> String {
        let results = problem.solve_rk4(0.1).unwrap();
        let (x_out, y_out) = results.get();

        let mut chart = Chart::new(100, 80, 0.0, problem.end_time);

        let mut line_data = Vec::new();
        for (i, _stock) in problem.system.stock_names.iter().enumerate() {
            line_data
                .push(x_out.iter().copied().zip(y_out.iter().map(|y| y[i])).collect::<Vec<_>>());
        }

        let mut lines = Vec::new();
        for (i, _stock) in problem.system.stock_names.iter().enumerate() {
            lines.push(Shape::Lines(&line_data[i]))
        }

        let chart = lines.iter().fold(&mut chart, |c, l| c.lineplot(l));

        chart.axis();
        chart.figures();

        format!("{}", chart)
    }

    fn test_stock_flow(
        analysis: &StockFlowODEAnalysis,
        model: &UstrDiscreteDblModel,
        expected: Expect,
    ) {
        match analysis.compile_system(model) {
            Ok(problem) => {
                expected.assert_eq(&plot(&problem));
            }
            Err(errors) => {
                let s = errors.iter().map(|e| format!("{}", e)).collect::<Vec<_>>().join("\n");
                expected.assert_eq(&s)
            }
        }
    }

    #[test]
    fn sir_stock_flow() {
        let stock_flow_theory = Arc::new(stdlib::theories::th_category());
        let mut sir = UstrDiscreteDblModel::new(stock_flow_theory);
        sir.add_ob(ustr("S"), ustr("Object"));
        sir.add_ob(ustr("I"), ustr("Object"));
        sir.add_ob(ustr("R"), ustr("Object"));
        sir.add_mor(ustr("inf"), ustr("S"), ustr("I"), FinMor::Id(ustr("Object")));
        sir.add_mor(ustr("rec"), ustr("I"), ustr("R"), FinMor::Id(ustr("Object")));

        let analysis = StockFlowODEAnalysis {
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

        test_stock_flow(
            &analysis,
            &sir,
            expect![[r#"
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
        "#]],
        );

        let analysis = StockFlowODEAnalysis {
            flow_expressions: [(ustr("inf"), "@S * I".to_string()), (ustr("rec"), "I".to_string())]
                .into_iter()
                .collect::<HashMap<_, _>>(),
            initial_values: [(ustr("S"), 4.0), (ustr("I"), 1.0), (ustr("R"), 0.0)]
                .into_iter()
                .collect::<HashMap<_, _>>(),
            simulation_length: 5.0,
            stock_object: ustr("Object"),
            flow_morphism: FinMor::Id(ustr("Object")),
        };

        test_stock_flow(
            &analysis,
            &sir,
            expect![[r#"
                compilation error in the flow expression for inf: lex error: unexpected start of token

                1 | @S * I
                  | ^

            "#]],
        );

        let analysis = StockFlowODEAnalysis {
            flow_expressions: [
                (ustr("inf"), "S * I".to_string()),
                (ustr("rec"), "I +".to_string()),
            ]
            .into_iter()
            .collect::<HashMap<_, _>>(),
            initial_values: [(ustr("S"), 4.0), (ustr("I"), 1.0), (ustr("R"), 0.0)]
                .into_iter()
                .collect::<HashMap<_, _>>(),
            simulation_length: 5.0,
            stock_object: ustr("Object"),
            flow_morphism: FinMor::Id(ustr("Object")),
        };

        test_stock_flow(
            &analysis,
            &sir,
            expect![[r#"
                compilation error in the flow expression for rec: parse error: expected start of factor

                1 | I +
                  |    ^

            "#]],
        );

        let analysis = StockFlowODEAnalysis {
            flow_expressions: [
                (ustr("inf"), "S *".to_string()),
                (ustr("rec"), "I + Q".to_string()),
            ]
            .into_iter()
            .collect::<HashMap<_, _>>(),
            initial_values: [(ustr("S"), 4.0), (ustr("I"), 1.0), (ustr("R"), 0.0)]
                .into_iter()
                .collect::<HashMap<_, _>>(),
            simulation_length: 5.0,
            stock_object: ustr("Object"),
            flow_morphism: FinMor::Id(ustr("Object")),
        };

        test_stock_flow(
            &analysis,
            &sir,
            expect![[r#"
                compilation error in the flow expression for inf: parse error: expected start of factor

                1 | S *
                  |    ^


                compilation error in the flow expression for rec: compile error: name not found Q

                1 | I + Q
                  |     ^

            "#]],
        );

        let analysis = StockFlowODEAnalysis {
            flow_expressions: [(ustr("rec"), "I".to_string())]
                .into_iter()
                .collect::<HashMap<_, _>>(),
            initial_values: [(ustr("I"), 1.0), (ustr("R"), 0.0)]
                .into_iter()
                .collect::<HashMap<_, _>>(),
            simulation_length: 5.0,
            stock_object: ustr("Object"),
            flow_morphism: FinMor::Id(ustr("Object")),
        };

        test_stock_flow(
            &analysis,
            &sir,
            expect![[r#"
                missing flow expression for inf
                missing initial value for stock S"#]],
        );
    }
}
