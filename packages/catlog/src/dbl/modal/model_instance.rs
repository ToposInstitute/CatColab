//! Instances of models of a modal double theory.

use crate::dbl::model_instance::{DblModelInstance, HasInstanceTerm, InstanceTerm};
use crate::dbl::theory::DblTheoryKind;
use crate::one::path::Path;
use crate::zero::QualifiedName;

use super::model::{ModalDblModel, ModalMor, ModalOb};
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
/// through [`ModalInstanceBase::List`], mirroring [`ModalOb::List`]:
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

/// If `mor` is an identity morphism (`Composite(Path::Id(ob))`), returns the
/// object it is the identity on.
///
/// Instance-term normalization uses this to keep terms in their flat normal
/// form: an identity `mor` means the term denotes its [`base`](ModalInstanceTerm::base)
/// directly, so a nested application whose argument is a pure base of
/// generators need not introduce a `Composite`/`List` wrapper.
pub fn modal_mor_as_identity(mor: &ModalMor) -> Option<&ModalOb> {
    match mor {
        ModalMor::Composite(path) => match path.as_ref() {
            Path::Id(ob) => Some(ob),
            _ => None,
        },
        _ => None,
    }
}
