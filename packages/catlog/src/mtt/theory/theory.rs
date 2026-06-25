//! TODO
use crate::mtt::{
    composite::Composite,
    theory::{
        Boundary, ProArrowByBoundary, TheoryArrow, TheoryObject, TheoryProArrow,
        UnificationResult, cell_search::default_cell_search, ListModality,
        unify_arrows::default_unify_vertical_arrows, unify_objects::default_unify_objects,
        unify_pro_arrows::default_unify_pro_arrows,
    },
};

/// TODO
pub trait Theory: Sized {
    // --------------------------------------------------------------------
    // Basic information

    /// The name of the theory.
    const NAME: &'static str;

    /// The unique list modality this theory supports, of which [NoList] is an
    /// option. To determine whether a theory has a list modality, see
    /// [ListModality::PRESENT].
    type ListModality: ListModality;

    // --------------------------------------------------------------------
    // Objects

    /// Decided whether a given [TheoryObject] is valid in this theory.
    fn has_object(obj: &TheoryObject<Self>) -> bool;

    /// Unify a collection of theory objects, returning the single most specific
    /// object they all refine to (their meet), or
    /// [UnificationResult::Incompatible] if they cannot be made to coincide.
    /// An empty collection has no rigid demands, so its meet is a fresh hole.
    ///
    /// There are presently no object-level equations in a theory, so this is
    /// always the purely structural notion and is not a customisation point
    /// yet: two rigid (non-hole) objects unify iff they share a head and their
    /// children unify, and holes are bare wildcards that unify with anything.
    fn unify_objects(objects: &[&TheoryObject<Self>]) -> UnificationResult<TheoryObject<Self>> {
        default_unify_objects::<Self>(objects)
    }

    // --------------------------------------------------------------------
    // Vertical arrows

    /// Look up a generating arrow by name, the theory is assumed to have
    /// unambiguous names. Implementors must return a
    /// [TheoryArrow::Generator].
    fn generating_arrow_by_name(name: &String) -> Option<TheoryArrow<Self>>;

    /// Decide whether a given [TheoryArrow] is valid in this theory.
    fn has_theory_arrow(arr: TheoryArrow<Self>) -> bool;

    /// Unify a collection of composites of theory vertical arrows, returning
    /// the single common composite they all coincide modulo the theory's arrow
    /// equations, or `None` if they cannot be made to coincide. An empty
    /// collection has no rigid demands, but there are no "holes" for vertical
    /// arrows and so unification must return [UnificationResult::Incompatible]
    /// in this case.
    fn unify_vertical_arrows(
        composites: &[&Composite<TheoryArrow<Self>>],
    ) -> UnificationResult<Composite<TheoryArrow<Self>>> {
        default_unify_vertical_arrows(composites)
    }

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
    /// single common composite they all coincide modulo the theory's
    /// pro-arrow equations, or `None` if they cannot be made to coincide. An
    /// empty collection has no rigid demands, so its meet is a singleton hole
    /// pro-arrow (mirroring [Self::unify_objects] on an empty input). See
    /// [default_unify_pro_arrows] for details about the default
    /// implementation.
    fn unify_pro_arrows(
        composites: &[&Composite<TheoryProArrow<Self>>],
    ) -> UnificationResult<Composite<TheoryProArrow<Self>>> {
        default_unify_pro_arrows(composites)
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

    /// Search for the at most unique flat cell connecting a top pro-arrow
    /// composite to a bottom one, returning the full [Boundary].
    ///
    /// In general there may not be a unique such boundary specialising to the
    /// given `top` and `bottom`, and in such a case we expect that callers
    /// would provide finer-grained contracts or are invariant to the choice, so
    /// that implementors may provide any boundary of their choosing.
    fn cell_search(
        top: &Composite<TheoryProArrow<Self>>,
        bottom: &Composite<TheoryProArrow<Self>>,
    ) -> Option<Boundary<Self>> {
        default_cell_search(top, bottom)
    }
}
