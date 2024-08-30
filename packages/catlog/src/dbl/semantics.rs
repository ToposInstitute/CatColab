use std::collections::HashMap;

use super::model::DblModel as _;
use super::model::*;
use crate::{
    one::{fin_category::FinMor, Category, FgCategory, FinGraph, Graph, SkelGraph},
    zero::{column::HashColumn, compile, run, Context, Env, Mapping, Prog, VecEnv},
};
use nalgebra::DVector;
use ode_solvers::System;
use ustr::{ustr, Ustr};

struct StockFlowExtension {
    flow_expressions: HashColumn<Ustr, String>,
    stock_object: Ustr,
    flow_morphism: FinMor<Ustr, Ustr>,
}

impl StockFlowExtension {
    fn validate(&self, model: &UstrDiscreteDblModel) -> bool {
        self.compile_system(model).is_ok()
    }

    fn compile_system(&self, model: &UstrDiscreteDblModel) -> Result<StockFlowSystem, String> {
        let mut stocks = model.objects_with_type(self.stock_object).collect::<Vec<_>>();
        stocks.sort();
        let idx_lookup = stocks
            .iter()
            .enumerate()
            .map(|(i, n)| (*n, i))
            .collect::<HashMap<Ustr, usize>>();
        let generators = model.generating_graph();
        let mut graph: SkelGraph = Default::default();
        graph.add_vertices(stocks.len());
        let mut flows = model.morphisms_with_type(self.flow_morphism.clone()).collect::<Vec<_>>();
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
                let src = self.flow_expressions.apply(name)?;
                compile(&ctx, src.as_str()).ok()
            })
            .collect::<Option<Vec<Prog<usize>>>>()
            .unwrap();
        Ok(StockFlowSystem { graph, flow_progs })
    }
}

struct StockFlowSystem {
    graph: SkelGraph,
    flow_progs: Vec<Prog<usize>>,
}

struct DVectorEnv<'a>(&'a DVector<f32>);

impl<'a> Env for DVectorEnv<'a> {
    type Var = usize;

    fn lookup(&self, t: &Self::Var) -> f32 {
        self.0[*t]
    }
}

impl System<f32, DVector<f32>> for StockFlowSystem {
    fn system(&self, _x: f32, y: &DVector<f32>, dy: &mut DVector<f32>) {
        let env = DVectorEnv(y);
        let flows = self.flow_progs.iter().map(|p| run(&env, p)).collect::<Vec<_>>();
        for i in self.graph.vertices() {
            dy[i] = self.graph.in_edges(&i).map(|j| flows[j]).sum::<f32>()
                - self.graph.out_edges(&i).map(|j| flows[j]).sum::<f32>();
        }
    }
}
