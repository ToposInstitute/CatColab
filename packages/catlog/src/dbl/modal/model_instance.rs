//! Instances of models of a modal double theory.

use crate::dbl::model_instance::{DblModelInstance, HasInstanceTerm, InstanceTerm};
use crate::dbl::theory::DblTheoryKind;
use crate::zero::QualifiedName;

use super::model::{ModalDblModel, ModalMor};
use super::theory::List;

/// A term in an instance of a modal double model: a single model morphism
/// applied to a base built from instance generators.
///
/// As in the discrete case, composition of model morphisms is reflected
/// inside [`mor`](Self::mor) itself — via [`ModalMor::Composite`] for
/// sequential composition and [`ModalMor::List`] for list-tupling — rather
/// than by nesting term constructors. A tree-shaped multicategory composite
/// such as `f([g(x), y])` therefore normalizes to *one* [`ModalMor`] applied
/// *once* to a base of bare generators; applications never nest. When `mor`
/// is the identity (`ModalMor::Composite(Path::Id(ob))`), the term denotes
/// `base` directly, and that `Id` object must agree with the fiber of `base`
/// in the surrounding instance.
///
/// The only recursion that survives lives in [`base`](Self::base), and only
/// through [`ModalInstanceBase::List`], mirroring [`ModalOb::List`](super::model::ModalOb::List):
/// this is what lets a generator over a nested list object be written inline
/// as e.g. `[x, y]` rather than forced to be a single named generator. A base
/// can never hold a morphism, so the "no application inside an application"
/// invariant is enforced structurally.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ModalInstanceTerm {
    /// Model morphism applied to `base`.
    pub mor: ModalMor,
    /// The base of instance generators at the root of the term.
    pub base: ModalInstanceBase,
}

/// The base of a [`ModalInstanceTerm`]: instance generators, tupled into
/// lists to match list-shaped fibers.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ModalInstanceBase {
    /// A single instance generator.
    Generator(QualifiedName),
    /// A list of bases in a [list modality](List), living over a
    /// [list object](super::model::ModalOb::List).
    List(List, Vec<ModalInstanceBase>),
}

impl InstanceTerm for ModalInstanceTerm {
    type Mor = ModalMor;
}

impl<Kind: DblTheoryKind> HasInstanceTerm for ModalDblModel<Kind> {
    type Term = ModalInstanceTerm;
}

/// An instance of a model of a modal double theory.
pub type ModalDblModelInstance<Kind> = DblModelInstance<ModalDblModel<Kind>>;
