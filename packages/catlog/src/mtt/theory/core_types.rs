//! Theory-level types: objects, arrows, and boundaries.

use std::marker::PhantomData;

use crate::mtt::{
    composite::Composite,
    hole::Holy,
    theory::{ListVariant, Theory},
};

// -----------------------------------------------------------------------------
// Theory types

/// An alias of String used for generating objects of the theory, to enforce
/// typing discipline.
pub type TheoryGeneratingObject = String;

/// The form that an object may take in the theory.
pub enum TheoryObject<T: Theory> {
    /// A generating object of a theory.
    Generator(TheoryGeneratingObject),

    /// A modal application to an object of the theory.
    ModalApplication {
        /// The modality in question.
        modality: ListVariant,
        /// Which theory object it was applied to.
        on: Box<TheoryObject<T>>,
    },

    /// A hole generated during type checking, and used for unification. A
    /// [TheoryObject] is a linear chain of modal applications terminating in a
    /// generator or a hole, so all partial knowledge about an object lives in
    /// the modal prefix above the hole; the hole itself is a bare wildcard
    /// carrying no constraints of its own.
    Hole {
        /// The name of the hole.
        name: String,
        /// For internal use only, and a by-product of Rust rules about type
        /// parameters. Theories are zero-sized, so we need only consume the
        /// parameter T.
        _theory: PhantomData<T>,
    },
}

/// An atomic (non-composite) theory vertical arrow between theory objects.
pub enum TheoryArrow<T: Theory> {
    /// A named generating vertical arrow at a stated boundary.
    Generator {
        /// The name of the generator.
        name: String,
        /// The domain object.
        dom: TheoryObject<T>,
        /// The codomain object.
        cod: TheoryObject<T>,
    },
    /// A vertical arrow under a list modality.
    ModalApplication {
        /// The modality applied.
        modality: ListVariant,
        /// The vertical arrow acted on.
        on: Box<TheoryArrow<T>>,
    },
    /// The unique coherence map of the list monad between two modal depths,
    /// bundling the monad's unit (η) and multiplication (μ) into a single
    /// framework-provided vertical arrow. By the monad's coherence, there is at
    /// most one such map between `T^m X` and `T^n X`, so the pair of depths
    /// determines it uniquely; the base object is fixed by the surrounding
    /// [Boundary]'s corner objects.
    ///
    /// This variant exists so that a flat theory's [Theory::cell_search] can
    /// name cells whose vertical legs involve monad structure --- such as the
    /// multicategory composition or normalisation cells --- without admitting
    /// η/μ as named, equational generators in any theory's presentation. It is
    /// distinct from the modality's leaf reindexings (σ), which are handled at
    /// the pro-term level by [ProTerm::ListReindex].
    ModalCoherence {
        /// The modal depth of the domain, i.e. the number of list modalities
        /// wrapping the base object.
        from_depth: usize,
        /// The modal depth of the codomain.
        to_depth: usize,
    },
}

/// An atomic (non-composite) theory pro-arrow.
pub enum TheoryProArrow<T: Theory> {
    /// The parametric identity pro-arrow on an object.
    Hom(TheoryObject<T>),
    /// A named generating pro-arrow at a stated boundary.
    Generator {
        /// The name of the generator.
        name: String,
        /// The domain object.
        dom: TheoryObject<T>,
        /// The codomain object.
        cod: TheoryObject<T>,
    },
    /// A pro-arrow  under a list modality.
    ModalApplication {
        /// The list modality being applied.
        modality: ListVariant,
        /// The pro-arrow being acted on.
        on: Box<TheoryProArrow<T>>,
    },
    /// A base pro-arrow restricted along a vertical arrow on each side: the
    /// `base` pulled back along `dom_leg` on the left and `cod_leg` on the
    /// right.
    Restriction {
        /// The pro-arrow being restricted.
        base: Box<TheoryProArrow<T>>,
        /// The vertical arrow restricting the domain side.
        dom_leg: TheoryArrow<T>,
        /// The vertical arrow restricting the codomain side.
        cod_leg: TheoryArrow<T>,
    },
    /// A hole for a pro-arrow, the matching information for which is carried by
    /// its domain and codomain. Note that [TheoryObject] also has "hole"
    /// variants.
    Hole {
        /// The domain object known so far.
        dom: TheoryObject<T>,
        /// The codomain object known so far.
        cod: TheoryObject<T>,
    },
}

// TODO: drop this!
pub fn delete_me_pro_arrow_is_constrained<T: Theory>(
    pro_arrow: &Composite<TheoryProArrow<T>>,
) -> bool {
    !matches!(pro_arrow.only(), Some(p) if p.is_hole())
}

/// The description of a (square) boundary in the theory, where the convention
/// in the comments is that vertical composition is top-to-bottom, and
/// pro-arrows are oriented left-to-right.
pub struct Boundary<T: Theory> {
    /// The top-left object.
    pub dom_dom_object: TheoryObject<T>,
    /// The top-right object.
    pub dom_cod_object: TheoryObject<T>,
    /// The bottom left object.
    pub cod_dom_object: TheoryObject<T>,
    /// The bottom right object.
    pub cod_cod_object: TheoryObject<T>,
    /// The left, vertical boundary.
    pub dom_vertical: Composite<TheoryArrow<T>>,
    /// The top, pro-arrow boundary.
    pub dom_proarrow: Composite<TheoryProArrow<T>>,
    /// The right, vertical boundary.
    pub cod_vertical: Composite<TheoryArrow<T>>,
    /// The bottom, pro-arrow boundary.
    pub cod_proarrow: Composite<TheoryProArrow<T>>,
}

impl<T: Theory> Boundary<T> {
    /// Obtain an array into the four corner objects of the cell. Call-sites
    /// must not depend on the ordering of these objects.
    pub fn objects(&self) -> [&TheoryObject<T>; 4] {
        [
            &self.dom_dom_object,
            &self.dom_cod_object,
            &self.cod_dom_object,
            &self.cod_cod_object,
        ]
    }
}

// -----------------------------------------------------------------------------
// Helper types

/// The outcome of unifying a collection of values. Isomorphic to `Option`, but
/// the variants name the contract directly: either the values are mutually
/// incompatible, or they unify and we hand back the single most specific value
/// they all refine to (their meet).
///
/// Rust support for the Try trait is currently on nightly, so we're not able to
/// leverage `?` in dealing with functions which return this particular enum.
pub enum UnificationResult<V> {
    /// The values cannot be made to coincide.
    Incompatible,
    /// The values unify; this is the most specific value they all refine to.
    MostSpecific(V),
}

impl<V> UnificationResult<V> {
    /// Whether the values unified (regardless of the meet).
    pub fn is_compatible(&self) -> bool {
        matches!(self, UnificationResult::MostSpecific(_))
    }

    /// The most specific value if the values unified, else `None`.
    pub fn most_specific(self) -> Option<V> {
        match self {
            UnificationResult::Incompatible => None,
            UnificationResult::MostSpecific(v) => Some(v),
        }
    }

    /// Map a function, semantics are natural with respect to the isomorphism to
    /// Option<T>.
    pub fn map<U, F: FnOnce(V) -> U>(self, f: F) -> UnificationResult<U> {
        match self {
            UnificationResult::MostSpecific(x) => UnificationResult::MostSpecific(f(x)),
            UnificationResult::Incompatible => UnificationResult::Incompatible,
        }
    }
}

/// The type reported by a theory when it's asked to decide what, if any,
/// [TheoryProArrow] between a specified pair of [TheoryObject]s.
pub enum ProArrowByBoundary<T: Theory> {
    /// Nothing fills the boundary.
    None,
    /// More than one distict filler exists.
    Ambiguous,
    /// The boundary is filled by the parametric hom pro-arrow, which is not a
    /// named generator.
    Hom(TheoryProArrow<T>),
    /// A composite of named generating pro-arrows fills the boundary.
    Composite(Composite<TheoryProArrow<T>>),
}
