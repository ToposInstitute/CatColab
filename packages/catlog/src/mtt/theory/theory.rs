use derive_more::Display;
use std::collections::HashSet;

use crate::mtt::checker::{
    Boundary, TheoryGeneratingArrow, TheoryGeneratingProArrow, TheoryObject,
};

#[derive(Clone, Display, PartialEq)]
/// The kind of list modality in question.
pub enum ListVariant {
    /// The "ordinary" list modality.
    Planar,
    /// Lists up to permutation, also known as multi-sets.
    Symmetric,
    /// The cartesian list modality.
    Cartesian,
}

pub trait Theory: Sized {
    fn name() -> String;

    fn list_modality() -> Option<ListVariant>;

    // TODO: explain that this has to be "unbiased" equality for the purposes of
    // constraint resolution.
    fn objects_unify(objects: &[&TheoryObject<Self>]) -> bool;

    fn make_hom_pro_arrow(
        obj_a: &TheoryObject<Self>,
        obj_b: &TheoryObject<Self>,
    ) -> Option<TheoryGeneratingProArrow<Self>>;

    fn lookup_generating_arrow(name: &String) -> Option<TheoryGeneratingArrow<Self>>;

    fn lookup_generating_pro_arrow(name: &String) -> Option<TheoryGeneratingProArrow<Self>>;

    fn generating_pro_arrow_by_boundary(
        dom: &TheoryObject<Self>,
        cod: &TheoryObject<Self>,
    ) -> HashSet<String>;

    fn has_object(obj: &TheoryObject<Self>) -> bool;

    fn has_generating_arrow(arr: TheoryGeneratingArrow<Self>) -> bool;

    fn has_generating_pro_arrow(pro: &TheoryGeneratingProArrow<Self>) -> bool;

    fn has_cell(b: &Boundary<Self>) -> bool;

    // TODO
}
