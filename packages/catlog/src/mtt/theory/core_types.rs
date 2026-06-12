//! Theory-level types: objects, arrows, and boundaries.

use std::marker::PhantomData;

use crate::mtt::{
    arrow::{Arrow, ProArrowKind, VerticalArrowKind},
    composite::Composite,
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
    /// TheoryObject is a linear chain of modal applications terminating in a
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

impl<T: Theory> PartialEq for TheoryObject<T> {
    fn eq(&self, other: &TheoryObject<T>) -> bool {
        T::objects_unify(&[self, other])
    }
}

// Rust does not, at the time of writing, have a sufficiently smart compiler.
// This causes two, related issues for us:
//
// 1. #[derive(Clone)] on TheoryObject adds the sufficient but not necessary
// bound T: Clone.
//
// 2. #[derive(Display)] incorrectly sets the bound for the Box<..> to be the
// entire structure again, and exhausts the recursive stack.
impl<T: Theory> Clone for TheoryObject<T> {
    fn clone(&self) -> Self {
        match self {
            Self::Generator(g) => Self::Generator(g.clone()),
            Self::ModalApplication { modality, on } => Self::ModalApplication {
                modality: modality.clone(),
                on: on.clone(),
            },
            Self::Hole { name, .. } => Self::Hole { name: name.clone(), _theory: PhantomData },
        }
    }
}

impl<T: Theory> std::fmt::Display for TheoryObject<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Generator(g) => write!(f, "{g}"),
            Self::ModalApplication { modality, on } => write!(f, "{modality}({on})"),
            Self::Hole { name, .. } => write!(f, "?{name}"),
        }
    }
}

/// Theory vertical arrows between theory objects.
pub type TheoryGeneratingArrow<T> = Arrow<TheoryObject<T>, VerticalArrowKind>;
/// Theory pro-arrows between theory objects. These are atomic (non-composite)
/// pro-arrows and *may* include the parametric hom pro-arrow — see
/// [`make_hom_pro_arrow`](../theory/trait.Theory.html#tymethod.make_hom_pro_arrow).
pub type TheoryProArrow<T> = Arrow<TheoryObject<T>, ProArrowKind>;

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
    pub dom_vertical: Composite<TheoryGeneratingArrow<T>>,
    /// The top, pro-arrow boundary.
    pub dom_proarrow: Composite<TheoryProArrow<T>>,
    /// The right, vertical boundary.
    pub cod_vertical: Composite<TheoryGeneratingArrow<T>>,
    /// The bottom, pro-arrow boundary.
    pub cod_proarrow: Composite<TheoryProArrow<T>>,
}
