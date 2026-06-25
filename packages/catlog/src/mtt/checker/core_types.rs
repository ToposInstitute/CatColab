//! TODO

use derive_more::Display;

use crate::mtt::{
    composite::Composite,
    theory::{Boundary, Theory, TheoryArrow, TheoryObject, TheoryProArrow},
};

// -----------------------------------------------------------------------------
// Model types

/// An alias of String used to specify generators in the model, enforce typing
/// discipline.
pub type ModelGeneratingObject = String;

/// A generating pro-arrow for a model: a named pro-arrow between two model
/// object types.
#[derive(Display)]
#[display("{name}: {dom} -|-> {cod}")]
pub struct ModelGeneratingProArrow<T: Theory> {
    /// The name of the generator.
    pub name: String,
    /// The domain object type.
    pub dom: ObjectType<T>,
    /// The codomain object type.
    pub cod: ObjectType<T>,
}

/// A type in the type theory of the model.
pub enum ObjectType<T: Theory> {
    /// A generating object in the model.
    Generator(ModelGeneratingObject),

    /// The list modality has first class treatment in this type checker. Note
    /// that despite writing Vec here, the nature of the List modality is
    /// determined by the theory (eg: symmetric vs planar).
    List(Vec<ObjectType<T>>),

    // #[display("({})", DHTuple(_0))]
    /// Tuples don't have a fixed meaning in the type theory, but are used as
    /// notational shorthand to denote some particular function application that
    /// the theory registers. Thus an an elaboration will turn this type into
    /// FunctionAppliction(theory.tuple_handler, List[...]).
    // Tuple(Vec<ObjectType>), TODO

    /// An application of theory vertical arrows to a model type.
    FunctionApplication {
        /// The composite of theory vertical arrows being applied.
        function: Composite<TheoryArrow<T>>,
        /// The model type to which the composite is being applied.
        on: Box<ObjectType<T>>,
    },

    /// A hole generated during type checking, and used for unification.
    Hole {
        /// The name of the hole.
        name: String,
        /// The theory object over which this hole lies. This records everything
        /// currently known about the hole: it may itself be (or contain) a
        /// theory-object hole when that knowledge is still partial. A single
        /// [TheoryObject] always suffices because a [TheoryObject] is a linear
        /// chain, so refining by new information is a meet that collapses to
        /// the more specific of the two — there is never a set of constraints.
        over: TheoryObject<T>,
    },
}

// -----------------------------------------------------------------------------
// Model terms

/// A term in the type theory of the model. This matches case-for-case the types
/// above, with the exception that there are no generating terms in this sense.
pub enum ObjectTerm<T: Theory> {
    /// A reference, possibly resolving to another ModelTerm.
    Variable(String),

    /// The list modality on terms.
    List(Vec<ObjectTerm<T>>),

    /// A tuple of terms, as explained above, this is a theory-dependant shorthand.
    Tuple(Vec<ObjectTerm<T>>),

    /// An application of theory vertical arrows to model terms.
    FunctionApplication {
        /// The composite of theory vertial arrows being applied.
        function: Composite<TheoryArrow<T>>,
        /// The model term to which the composite is being applied.
        on: Box<ObjectTerm<T>>,
    },

    /// A hole generated during type checking, and used for unification.
    Hole(String),
}

// -----------------------------------------------------------------------------
// Pro-terms

/// The main content of the type checker, these are specified in the type theory
/// by deriving judgements of the form Γ | x : X ⊢_P y : Y.
pub enum ProTerm<T: Theory> {
    /// The canonical "identity" pro-term, x : X ⊢_Hom(𝕩) x : X where X : Ob_𝕩
    /// and 𝕩 is an object of the theory.
    Hom {
        /// The object term, "x" in the above.
        object_term: ObjectTerm<T>,
        /// The object type, "X" in the above.
        object_type: ObjectType<T>,
        /// The theory object, "𝕩" in the above.
        theory_object: TheoryObject<T>,
    },

    /// The first-class encoding of the list-modality acting on pro-terms. The
    /// precise nature of the allowed arrangement and its use is determined by
    /// the theory and enforced in the checker.
    List(Vec<ProTerm<T>>),

    /// Post-composition of a pro-term by a generating pro-arrow.
    PostComposition {
        /// The generator in the post-composition.
        generator: ModelGeneratingProArrow<T>,
        /// The theory pro-arrow over which the generator lies.
        generator_over: TheoryProArrow<T>,
        /// The pro-term where are post-composing.
        pro_term: Box<ProTerm<T>>,
    },

    /// Flat theories determine cells uniquely by their boundaries, and so the
    /// resulting pro-term is determined uniquely by the starting pro-term and
    /// the boundary of the cell from the theory. Application of theory vertical
    /// arrows is a special case of this, when the cell boundary is that of a
    /// vertical identity cell.
    CellApplication {
        /// The theory boundary of the cell being applied. This in particular
        /// implies taking object terms to the theory objects over which they
        /// lie.
        theory_boundary: Boundary<T>,
        /// The pro-term lying over the top boundary in the theory.
        on: Box<ProTerm<T>>,
    },

    /// Theories have restrictions, which allows us to transport pro-terms over
    /// theory pro-arrows backwards to the top boundary of a restriction niche.
    /// Indeed this constitutes a bijection, and this is a form of β for the
    /// type theory.
    Restriction {
        /// The theory boundary of the cell being applied. This in particular
        /// implies taking object terms to the theory objects over which they
        /// lie.
        theory_boundary: Boundary<T>,
        /// The pro-term lying over the bottom boundary in the theory.
        on: Box<ProTerm<T>>,
    },

    /// A syntactic reindexing of a pro-term's domain variables, realising the
    /// leaf map (reorder/duplicate/drop) admitted by the theory's list
    /// modality. This is the model-level residue of reconciliation once the
    /// theory has agreed (via [Theory::cell_search]) that a cell connects the
    /// synthesised pro-arrow to the wanted one: the cell's vertical legs carry
    /// any change in modal depth ([TheoryArrow::ModalCoherence]), while this
    /// node carries the within-level permutation of the domain's variables so
    /// that the synthesised domain term lines up with the declared binder.
    ///
    /// The `before` and `after` object types record the domain's shape on each
    /// side of the reindex; the modality decides whether `reindex` is admissible
    /// between them. There is no codomain counterpart, as the pro-term *is* the
    /// codomain and has no separate term to reindex.
    ListReindex {
        /// The domain object type before reindexing (the synthesised domain).
        before: ObjectType<T>,
        /// The domain object type after reindexing (the declared binder).
        after: ObjectType<T>,
        /// The leaf map: `reindex[i]` is the source leaf placed at target
        /// position `i`. The identity is `(0..n).collect()`.
        reindex: Vec<usize>,
        /// The pro-term whose domain variables are being reindexed.
        on: Box<ProTerm<T>>,
    },

    /// A hole generated during type checking, and used for unification.
    Hole(String),
}
