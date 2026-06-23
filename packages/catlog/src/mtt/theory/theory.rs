//! TODO
use crate::mtt::{
    composite::Composite,
    theory::{
        Boundary, ListVariant, ProArrowByBoundary, TheoryArrow, TheoryObject, TheoryProArrow,
        UnificationResult,
        shared::{default_pro_arrow_composite_unify, structural_object_unification},
    },
};

/// TODO
pub trait Theory: Sized {
    // --------------------------------------------------------------------
    // Basic information

    /// The name of the theory.
    fn name() -> String;

    /// Theories may support up to one list modality.
    fn list_modality() -> Option<ListVariant>;

    // --------------------------------------------------------------------
    // Objects

    /// Decided whether a given [TheoryObject] is valid in this theory.
    fn has_object(obj: &TheoryObject<Self>) -> bool;

    /// Unify a collection of theory objects, returning the single most specific
    /// object they all refine to (their meet), or
    /// [UnificationResult::Incompatible] if they cannot be made to coincide.
    ///
    /// There are presently no object-level equations in a theory, so this is
    /// always the purely structural notion and is not a customisation point
    /// yet: two rigid (non-hole) objects unify iff they share a head and their
    /// children unify, and holes are bare wildcards that unify with anything.
    fn unify_objects(objects: &[&TheoryObject<Self>]) -> UnificationResult<TheoryObject<Self>> {
        structural_object_unification::<Self>(objects)
    }

    // --------------------------------------------------------------------
    // Vertical arrows

    /// Look up a generating arrow by name, the theory is assumed to have
    /// unambiguous names. Implementors must return a
    /// [TheoryArrow::Generator].
    fn generating_arrow_by_name(name: &String) -> Option<TheoryArrow<Self>>;

    /// Decide whether a given [TheoryArrow] is valid in this theory.
    fn has_theory_arrow(arr: TheoryArrow<Self>) -> bool;

    // --------------------------------------------------------------------
    // Pro-arrows

    /// Look up a generating pro-arrow by name, the theory is assumed to have
    /// unambiguous names. Implementors must return an
    /// [TheoryProArrow::Generator], in particular this precludes
    /// [TheoryProArrow::Hom] from being looked up by name.
    fn generating_pro_arrow_by_name(name: &String) -> Option<TheoryProArrow<Self>>;

    /// Construct the canonical hom (identity) pro-arrow on a pair of objects,
    /// provided the two objects can be made to unify, see
    /// [Self::objects_unify_to_most_specific].
    fn make_hom_pro_arrow(
        obj_a: &TheoryObject<Self>,
        obj_b: &TheoryObject<Self>,
    ) -> Option<TheoryProArrow<Self>>;

    /// Unify a collection of composites of theory pro-arrows, returning the
    /// single common composite they all coincide with modulo the theory's
    /// pro-arrow equations, or `None` if they cannot be made to coincide. See
    /// [default_pro_arrow_composite_unify] for details about the default
    /// implementation.
    fn unify_pro_arrows(
        composites: &[&Composite<TheoryProArrow<Self>>],
    ) -> UnificationResult<Composite<TheoryProArrow<Self>>> {
        default_pro_arrow_composite_unify(composites)
    }

    /// Decide what information is available about pro-arrows given the
    /// specified [TheoryObject] boundary.
    fn pro_arrow_by_boundary(
        dom: &TheoryObject<Self>,
        cod: &TheoryObject<Self>,
    ) -> ProArrowByBoundary<Self>;

    /// Decide whether a given [TheoryProArrow] is valid in this theory.
    fn has_pro_arrow(pro: &TheoryProArrow<Self>) -> bool;

    // --------------------------------------------------------------------
    // Cells
    /// Decide whether a given [Boundary] admits a, necessarily unique, cell
    /// filler in this theory.
    fn has_cell(b: &Boundary<Self>) -> bool;

    // TODO
}
