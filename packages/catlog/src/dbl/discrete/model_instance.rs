//! Instances of models of a discrete double theory.

use crate::dbl::model_instance::{DblModelInstance, HasInstanceTerm, InstanceTerm};
use crate::one::QualifiedPath;
use crate::zero::QualifiedName;

use super::model::DiscreteDblModel;

/// A term in an instance of a discrete double model: a model morphism
/// applied to a single instance generator.
///
/// Composition of model morphisms is reflected inside [`path`](Self::path)
/// itself, not by nesting term constructors, so every term has the
/// flat canonical shape `path(base)`. When `path` is the identity, the
/// term denotes `base` directly; its `Id` vertex must agree with the
/// fiber of `base` in the surrounding instance.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DiscreteInstanceTerm {
    /// Model morphism applied to `base`.
    pub path: QualifiedPath,
    /// The instance generator at the root of the term.
    pub base: QualifiedName,
}

impl InstanceTerm for DiscreteInstanceTerm {
    type Mor = QualifiedPath;
}

impl HasInstanceTerm for DiscreteDblModel {
    type Term = DiscreteInstanceTerm;
}

/// An instance of a model of a discrete double theory.
pub type DiscreteDblModelInstance = DblModelInstance<DiscreteDblModel>;
