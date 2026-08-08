//! The default cell search algorithm for theories. See [default_cell_search]
//! for details.

use crate::mtt::{
    binary_signature::BinarySignature,
    composite::Composite,
    theory::{Boundary, Theory, TheoryProArrow},
};

/// The default [Theory::cell_search] supporting non-modal theories with no
/// vertical arrow generators. Thus this procedure "searches" only for globular
/// identity cells, where the sense of "identity" is carried by
/// [Theory::unify_pro_arrows] and [Theory::unify_objects].
pub fn default_cell_search<T: Theory>(
    top: &Composite<TheoryProArrow<T>>,
    bottom: &Composite<TheoryProArrow<T>>,
) -> Option<Boundary<T>> {
    // (1) The empty composite has no meaning as a pro-arrow in the theory, so
    // it may never appear as the bottom boundary of a cell.
    if bottom.is_empty() {
        return None;
    }

    // (2) Every pro-arrow appearing on either boundary must be recognised.
    if !top.iter().all(T::has_pro_arrow) || !bottom.iter().all(T::has_pro_arrow) {
        return None;
    }

    // (3) The corner objects: for a cell with empty vertical legs the top-left
    // and bottom-left corners agree, and the top-right and bottom-right corners
    // agree. Compute each shared corner as the meet of the two endpoints.
    let left = T::unify_objects(&[&top.dom(), &bottom.dom()]).most_specific()?;
    let right = T::unify_objects(&[&top.cod(), &bottom.cod()]).most_specific()?;

    if !T::has_object(&left) || !T::has_object(&right) {
        return None;
    }

    // (4) The two pro-arrow composites must unify modulo the theory's
    // pro-arrow equations.
    if !T::unify_pro_arrows(&[top, bottom]).is_compatible() {
        return None;
    }

    Some(Boundary {
        dom_dom_object: left.clone(),
        dom_cod_object: right.clone(),
        cod_dom_object: left,
        cod_cod_object: right,
        dom_vertical: Composite::empty(),
        cod_vertical: Composite::empty(),
        dom_proarrow: top.clone(),
        cod_proarrow: bottom.clone(),
    })
}
