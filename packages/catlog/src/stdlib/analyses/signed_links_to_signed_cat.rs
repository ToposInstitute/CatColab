//! Migration for going from categories with signed links to signed categories
//  (e.g. from signed stock-flow diagrams to causal loop diagrams)
//
// Note that this migration expects a DiscreteTabModel whose underlying theory
// is th_category_signed_links, otherwise it will panic

use crate::dbl::discrete_tabulator::theory::{TabMorType, TabObType};
use std::rc::Rc;

use crate::dbl::discrete::model::DiscreteDblModel;
use crate::dbl::discrete_tabulator::model::DiscreteTabModel;
use crate::dbl::model::{FgDblModel, MutDblModel};
use crate::one::category::FgCategory;
use crate::one::path::Path;
use crate::stdlib::theories;
use crate::zero::name;

/// Span-migration for categories with signed links.
/// 
/// We create a CLD from a category with signed links from the query defined on
/// objects as
/// 
/// V  |-> stock : S | flow : F
/// E+ |-> out : F   | link : L+
/// E- |-> in : F    | link : L-
///
/// and on morphisms as (...) something that will be written up eventually, but
/// in short can be described quite simply in words:
///
/// 1. For each stock, create a vertex
/// 2. For each flow, create a (+,-)-span, where the apex is a new vertex
///    corresponding to the flow, and there is a negative arrow to the (vertex
///    corresponding to the) source of the flow, and a positive arrow to the
///    (vertex corresponding to the) target of the flow
/// 3. For each (signed) link, create an arrow (of the same sign) from the
///    (vertex corresponding to the) source stock to the (vertex corresponding
///    to the) target flow
pub fn span_migrate(model: DiscreteTabModel) -> DiscreteDblModel {
    let mut migrated_model: DiscreteDblModel =
        DiscreteDblModel::new(Rc::new(theories::th_signed_category()));

    let stock_type = TabObType::Basic(name("Object"));
    let flow_type = TabMorType::Hom(Box::new(stock_type.clone()));
    let pos_link_type = TabMorType::Basic(name("Link"));
    let neg_link_type = TabMorType::Basic(name("NegativeLink"));

    // Create an object for each stock (a "stock-object")
    for stock in model.ob_generators() {
        migrated_model.add_ob(stock.clone(), name("Object"));
    }

    // Create a span for each flow
    for flow in model.mor_generators_with_type(&flow_type) {
        // An object for each flow (a "flow-object")
        migrated_model.add_ob(flow.clone(), name("Object"));
        // A negative link from the flow object to the flow-source object
        migrated_model.add_mor(
            format!("{}_in", flow).as_str().into(),
            flow.clone(),
            model.mor_generator_dom(&flow).unwrap_basic(),
            name("Negative").into(),
        );
        // A positive link from the flow object to the flow-target object
        migrated_model.add_mor(
            format!("{}_out", flow).as_str().into(),
            flow.clone(),
            model.mor_generator_cod(&flow).unwrap_basic(),
            Path::Id(name("Object")),
        );
    }

    // Create a positive arrow for each positive link
    for pl in model.mor_generators_with_type(&pos_link_type) {
        // We know, by design, that the codomain of a morphism generator of type
        // pos_link_type will be of type TabOb::Tabulated and furthermore will
        // contain (in its box) a path (TabMor) consisting of a *single* TabEdge
        // which will *furthermore* itself be of type TabEdge::Basic
        let pl_cod = model
            .mor_generator_cod(&pl)
            .unwrap_tabulated()
            .only()
            .expect("Morphism should be a singleton path of type TabEdge")
            .unwrap_basic();
        migrated_model.add_mor(
            pl.clone(),
            model.mor_generator_dom(&pl).unwrap_basic(),
            pl_cod,
            Path::Id(name("Object")),
        );
    }
    // Create a negative arrow for each negative link
    for nl in model.mor_generators_with_type(&neg_link_type) {
        let nl_cod = model
            .mor_generator_cod(&nl)
            .unwrap_tabulated()
            .only()
            .expect("Morphism should be a singleton path of type TabEdge")
            .unwrap_basic();
        migrated_model.add_mor(
            nl.clone(),
            model.mor_generator_dom(&nl).unwrap_basic(),
            nl_cod,
            name("Negative").into(),
        );
    }

    migrated_model
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dbl::model::MutDblModel;
    use crate::stdlib::negative_backward_link;
    use std::rc::Rc;

    #[test]
    fn negative_backward_link_to_cld() {
        // Build the negative backwards link stock-flow diagram
        let csl_th = Rc::new(theories::th_category_signed_links());
        let sf_model = negative_backward_link(csl_th);

        // Manually construct the correct migration
        let sc_th = Rc::new(theories::th_signed_category());
        let mut cld_model = DiscreteDblModel::new(sc_th);
        cld_model.add_ob(name("x"), name("Object"));
        cld_model.add_ob(name("y"), name("Object"));
        cld_model.add_ob(name("f"), name("Object"));
        cld_model.add_mor(name("f_in"), name("f"), name("x"), name("Negative").into());
        cld_model.add_mor(name("f_out"), name("f"), name("y"), Path::Id(name("Object")));
        cld_model.add_mor(name("link"), name("y"), name("f"), name("Negative").into());

        // Test the putative migration against the correct one
        assert_eq!(span_migrate(sf_model), cld_model);
    }
}
