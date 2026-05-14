//! Helpers for analyses on stock-flow diagrams.

use crate::dbl::discrete_tabulator::DiscreteTabModel;
use crate::dbl::discrete_tabulator::TabEdge;
use crate::dbl::discrete_tabulator::TabMorType;
use crate::dbl::model::FpDblModel;
use crate::dbl::model::TabOb;
use crate::one::category::FgCategory;
use crate::zero::QualifiedName;
use crate::zero::name;

pub struct FlowInterface {
    pub input_stock: TabOb,
    pub input_pos_link_doms: Vec<TabOb>,
    pub input_neg_link_doms: Vec<TabOb>,
    pub output_stock: TabOb,
}

/// Gets the inputs (including links) and output of a flow in a stock-flow diagram.
pub fn flow_interface(model: &DiscreteTabModel, flow: &QualifiedName) -> FlowInterface {
    let dom = model.mor_generator_dom(flow);
    let cod = model.mor_generator_cod(flow);

    let mut input_pos_link_doms: Vec<TabOb> = Vec::new();
    let mut input_neg_link_doms: Vec<TabOb> = Vec::new();

    // Iterate over positive links and add them to the interface if their codomain is the
    // link in question.
    for link in model.mor_generators_with_type(&TabMorType::Basic(name("Link"))) {
        let dom = model.mor_generator_dom(&link);
        let path = model.mor_generator_cod(&link).unwrap_tabulated();
        let Some(TabEdge::Basic(cod)) = path.only() else {
            panic!("Codomain of link should be basic morphism");
        };
        if cod == *flow {
            input_pos_link_doms.push(dom)
        };
    }

    // Iterate over negative links and add them to the interface if their codomain is the
    // link in question.
    for link in model.mor_generators_with_type(&TabMorType::Basic(name("NegativeLink"))) {
        let dom = model.mor_generator_dom(&link);
        let path = model.mor_generator_cod(&link).unwrap_tabulated();
        let Some(TabEdge::Basic(cod)) = path.only() else {
            panic!("Codomain of link should be basic morphism");
        };
        if cod == *flow {
            input_neg_link_doms.push(dom)
        };
    }

    FlowInterface {
        input_stock: dom,
        input_pos_link_doms,
        input_neg_link_doms,
        output_stock: cod,
    }
}
