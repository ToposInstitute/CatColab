//! The working definition of a theory in MTT, see [Theory] for details.
use crate::mtt::{
    composite::Composite,
    theory::{
        AtomicFiller, Boundary, CompositeFiller, ListModality, NoListModality, ProArrowByBoundary,
        TheoryObject, TheoryProArrow, TheoryVerticalArrow, UnificationResult,
        cell_search::default_cell_search, unify_arrows::default_unify_vertical_arrows,
        unify_objects::default_unify_objects, unify_pro_arrows::default_unify_pro_arrows,
    },
};

/// A theory in MTT in understood an in "extensional" manner, and is therefore a
/// collection of decision, normalisation, and search procedures as opposed to
/// the data underlying the presentation of some kind of virtual double
/// category. Conceptually these arise from proving classification or flatness
/// theorems about these objects, but our definition shortcuts this process and
/// demands of its implementators the direct encoding of these results.
pub trait Theory: Sized + 'static {
    // --------------------------------------------------------------------
    // Basic information

    /// The name of the theory.
    const NAME: &'static str;

    /// The unique list modality this theory supports, of which [NoListModality]
    /// is an option. To determine whether a theory has a list modality, see
    /// [Self::has_list_modality].
    type ListModality: ListModality;

    /// Whether this theory has a list modality. The default implementation
    /// derives the answer from [Self::ListModality]: a theory has a list
    /// modality iff its declared modality type is not [NoListModality]. This is
    /// not presently a customisation point.
    fn has_list_modality() -> bool {
        std::any::TypeId::of::<Self::ListModality>() != std::any::TypeId::of::<NoListModality>()
    }

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
    /// unambiguous names. Implementors that have vertical arrow generators
    /// must override to return a [TheoryVerticalArrow::Generator]. The default
    /// returns `None`, which is appropriate for theories with no vertical
    /// arrow generators.
    fn generating_vertical_arrow_by_name(_name: &String) -> Option<TheoryVerticalArrow<Self>> {
        None
    }

    /// Decide whether a given [TheoryVerticalArrow] is valid in this theory.
    /// The default returns `false`, which is appropriate only for theories with
    /// no list modality and no vertical arrow generators. Theories with a list
    /// modality must override this to recognise
    /// [TheoryVerticalArrow::ModalStructureMap] and
    /// [TheoryVerticalArrow::ModalApplication].
    fn has_vertical_arrow(_arr: TheoryVerticalArrow<Self>) -> bool {
        false
    }

    /// Unify a collection of composites of theory vertical arrows, returning
    /// the single common composite they all coincide modulo the theory's arrow
    /// equations, or `None` if they cannot be made to coincide. An empty
    /// collection has no rigid demands, but there are no "holes" for vertical
    /// arrows and so unification must return [UnificationResult::Incompatible]
    /// in this case.
    fn unify_vertical_arrows(
        composites: &[&Composite<TheoryVerticalArrow<Self>>],
    ) -> UnificationResult<Composite<TheoryVerticalArrow<Self>>> {
        default_unify_vertical_arrows(composites)
    }

    // --------------------------------------------------------------------
    // Pro-arrows

    /// Look up a generating pro-arrow by name, the theory is assumed to have
    /// unambiguous names. Implementors must return an
    /// [TheoryProArrow::Generator], in particular this precludes
    /// [TheoryProArrow::Hom] from being looked up by name.
    fn generating_pro_arrow_by_name(name: &str) -> Option<TheoryProArrow<Self>>;

    /// Construct the canonical hom (identity) pro-arrow on a pair of objects,
    /// provided the two objects can be made to unify, see
    /// [Self::unify_objects]. This is not presently a customisation point.
    fn make_hom_pro_arrow(
        obj_a: &TheoryObject<Self>,
        obj_b: &TheoryObject<Self>,
    ) -> Option<TheoryProArrow<Self>> {
        Self::unify_objects(&[obj_a, obj_b]).most_specific().map(TheoryProArrow::Hom)
    }

    /// Unify a collection of composites of theory pro-arrows, returning the
    /// single common composite they all coincide modulo the theory's pro-arrow
    /// equations, or `None` if they cannot be made to coincide. An empty
    /// collection has no rigid demands, so its meet is a singleton hole
    /// pro-arrow (mirroring [Self::unify_objects] on an empty input). See
    /// [`default_unify_pro_arrows`] for details about the default
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
    ) -> ProArrowByBoundary<Self, CompositeFiller>;

    /// Like [Self::pro_arrow_by_boundary] but reporting only a single atomic
    /// filler. The default implementation attempts only the parametric hom
    /// filler via [Self::make_hom_pro_arrow]; theories with named generating
    /// pro-arrows should override this to recognise them.
    fn generating_pro_arrows_by_boundary(
        dom: &TheoryObject<Self>,
        cod: &TheoryObject<Self>,
    ) -> ProArrowByBoundary<Self, AtomicFiller> {
        match Self::make_hom_pro_arrow(dom, cod) {
            Some(hom) => ProArrowByBoundary::Determined(hom),
            None => ProArrowByBoundary::None,
        }
    }

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
    ///
    /// When the two pro-arrows coincide modulo the theory's equations, the
    /// connecting cell is the identity: both vertical legs of the returned
    /// [Boundary] are empty. Implementors must uphold this, and callers may
    /// rely on it to detect no-op cells.
    fn cell_search(
        top: &Composite<TheoryProArrow<Self>>,
        bottom: &Composite<TheoryProArrow<Self>>,
    ) -> Option<Boundary<Self>> {
        default_cell_search(top, bottom)
    }
}
