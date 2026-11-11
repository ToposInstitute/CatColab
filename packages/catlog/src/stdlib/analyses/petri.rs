//! Helpers for analyses on Petri nets.

use crate::dbl::model::{ModalDblModel, MutDblModel};
use crate::dbl::theory::Unital;
use crate::zero::QualifiedName;

pub struct TransitionInterface {
    pub input_places: Vec<QualifiedName>,
    pub output_places: Vec<QualifiedName>,
}

// TODO: Unfortunately, in the case of transition_interface, there is a further
//       subtlety that isn't addressed by these considerations. The collect_product
//       function only collects one level of operation application, as opposed to
//       acting recursively. Thus, I'd say it's technically incorrect to unwrap
//       generators from the lists returned. This point is a bit academic since in
//       the notebook editor you couldn't construct such a model anyway, but it is
//       perfectly valid in the text elaborator to write tensor [a, tensor [b, c]]
//       and we shouldn't bomb on that.
//
//       To do this safely, you should collect recursively rather than at one level;
//       however, under the validation assumption, you are allowed (in fact
//       encouraged) to panic if you encounter anything that is not an basic object
//       or an application of tensor to a list.

/// Gets the inputs and outputs of a transition in a Petri net.
pub fn transition_interface(
    model: &ModalDblModel<Unital>,
    id: &QualifiedName,
) -> TransitionInterface {
    let inputs = model
        .get_dom(id)
        .and_then(|ob| ob.clone().collect_product(None))
        .unwrap_or_default()
        .into_iter()
        .map(|ob| ob.unwrap_generator())
        .collect();
    let outputs = model
        .get_cod(id)
        .and_then(|ob| ob.clone().collect_product(None))
        .unwrap_or_default()
        .into_iter()
        .map(|ob| ob.unwrap_generator())
        .collect();
    TransitionInterface {
        input_places: inputs,
        output_places: outputs,
    }
}
