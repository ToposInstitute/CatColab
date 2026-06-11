//! TODO
use derive_more::Display;
use std::collections::HashSet;

use crate::mtt::checker::{Boundary, TheoryGeneratingArrow, TheoryObject, TheoryProArrow};

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

/// TODO
///
/// The canonical hom pro-arrow is a distinguished, parametric identity
/// pro-arrow on each object. It is **not** treated as a named generating
/// pro-arrow in this trait: [`lookup_generating_pro_arrow`] must not return it,
/// [`generating_pro_arrow_by_boundary`] must not report it, and
/// [`make_hom_pro_arrow`] is the sole mechanism for constructing homs.
pub trait Theory: Sized {
    /// The name of the theory.
    fn name() -> String;

    /// Theories may support up to one list modality.
    fn list_modality() -> Option<ListVariant>;

    /// Decide whether a collection of theory objects can be made equal
    /// simultaneously, i.e. perform unbiased unification. The reason for the
    /// unbiased version is that binary unification is not transitive (a hole
    /// may unify with two rigid objects that do not unify with each other).
    ///
    /// There are no object-level equations in a theory --- objects are only
    /// generators and modal applications --- so this is always the purely
    /// structural notion and is not a customisation point: two rigid (non-hole)
    /// objects unify iff they share a head and their children unify, and holes
    /// are bare wildcards that unify with anything.
    fn objects_unify(objects: &[&TheoryObject<Self>]) -> bool {
        // Drop the holes, which are bare wildcards, leaving only the rigid
        // demands that must all coincide.
        let rigid: Vec<&TheoryObject<Self>> = objects
            .iter()
            .copied()
            .filter(|o| !matches!(o, TheoryObject::Hole { .. }))
            .collect();

        // With no rigid demands everything is still free, so they unify.
        let Some((first, rest)) = rigid.split_first() else {
            return true;
        };

        match first {
            // Generators unify iff they are all the very same generator.
            TheoryObject::Generator(name) => rest
                .iter()
                .all(|o| matches!(o, TheoryObject::Generator(other) if other == name)),
            // Modal applications unify iff they share a modality and their
            // children unify simultaneously (again unbiased).
            TheoryObject::ModalApplication { modality, on } => {
                let mut children: Vec<&TheoryObject<Self>> = vec![on.as_ref()];
                for o in rest {
                    let TheoryObject::ModalApplication { modality: m, on } = o else {
                        return false;
                    };
                    if m != modality {
                        return false;
                    }
                    children.push(on.as_ref());
                }
                Self::objects_unify(&children)
            }
            // Holes were filtered out of `rigid`, so the first rigid element
            // is never a hole.
            TheoryObject::Hole { .. } => unreachable!("holes are filtered out of the pool"),
        }
    }

    /// Construct the canonical hom (identity) pro-arrow on a pair of objects,
    /// provided the two objects can be made to coincide. The hom pro-arrow is
    /// parametric in its object arguments and is **not** a named generating
    /// pro-arrow: it cannot be retrieved via [`lookup_generating_pro_arrow`] by
    /// name, and it is never reported as a result of
    /// [`generating_pro_arrow_by_boundary`].
    fn make_hom_pro_arrow(
        obj_a: &TheoryObject<Self>,
        obj_b: &TheoryObject<Self>,
    ) -> Option<TheoryProArrow<Self>>;

    /// TODO
    fn lookup_generating_arrow(name: &String) -> Option<TheoryGeneratingArrow<Self>>;

    /// Look up a named generating pro-arrow by name. The canonical hom
    /// pro-arrow is parametric in its object arguments and must **not** be
    /// returned by this function; use [`make_hom_pro_arrow`] to construct homs.
    fn lookup_generating_pro_arrow(name: &String) -> Option<TheoryProArrow<Self>>;

    /// Return the set of named generating pro-arrows that fill the given
    /// boundary (domain, codomain). The canonical hom pro-arrow, which fills
    /// every self-boundary (dom == cod), is **not** reported here; inference
    /// recovers homs via [`make_hom_pro_arrow`] as a fallback instead.
    fn generating_pro_arrow_by_boundary(
        dom: &TheoryObject<Self>,
        cod: &TheoryObject<Self>,
    ) -> HashSet<String>;

    /// TODO
    fn has_object(obj: &TheoryObject<Self>) -> bool;

    /// TODO
    fn has_generating_arrow(arr: TheoryGeneratingArrow<Self>) -> bool;

    /// Decide whether a given `TheoryProArrow` (name + boundary) is valid in
    /// this theory. Unlike [`lookup_generating_pro_arrow`] and
    /// [`generating_pro_arrow_by_boundary`], this is a membership test and
    /// does accept the parametric hom pro-arrow.
    fn has_pro_arrow(pro: &TheoryProArrow<Self>) -> bool;

    /// TODO
    fn has_cell(b: &Boundary<Self>) -> bool;

    // TODO
}
