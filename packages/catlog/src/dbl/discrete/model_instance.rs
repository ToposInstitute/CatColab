//! Instances of models of a discrete double theory.

use crate::dbl::model_instance::{DblModelInstance, HasInstanceTerm, InstanceTerm};
use crate::one::QualifiedPath;
use crate::zero::QualifiedName;

use super::model::DiscreteDblModel;

/// A term in an instance of a discrete double model.
///
/// Discrete morphisms have single-object domains, so applications are
/// 1-ary.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DiscreteInstanceTerm {
    /// A bare instance generator.
    Generator(QualifiedName),
    /// A morphism of the model applied to one argument term.
    Apply(QualifiedPath, Box<DiscreteInstanceTerm>),
}

impl InstanceTerm for DiscreteInstanceTerm {
    type Mor = QualifiedPath;
}

impl HasInstanceTerm for DiscreteDblModel {
    type Term = DiscreteInstanceTerm;
}

/// An instance of a model of a discrete double theory.
pub type DiscreteDblModelInstance = DblModelInstance<DiscreteDblModel>;
