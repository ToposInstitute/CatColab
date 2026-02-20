//! Helpers for analyses on Petri nets.

use crate::dbl::model::{ModalDblModel, ModalOb, MutDblModel};
use crate::zero::QualifiedName;

/// Gets the inputs and outputs of a transition in a Petri net.
pub fn transition_interface(
    model: &ModalDblModel,
    id: &QualifiedName,
) -> (Vec<ModalOb>, Vec<ModalOb>) {
    let inputs = model
        .get_dom(id)
        .and_then(|ob| ob.clone().collect_product(None))
        .unwrap_or_default();
    let outputs = model
        .get_cod(id)
        .and_then(|ob| ob.clone().collect_product(None))
        .unwrap_or_default();
    (inputs, outputs)
}
