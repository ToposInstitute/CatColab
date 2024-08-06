//! Morphisms between models of double theories.

use crate::zero::HashColumn;
use crate::one::Path;

/** A mapping between models of a double theory.

Analogous to a mapping between [sets](crate::zero::Mapping) or
[graphs](crate::one::GraphMapping), a model mapping is a morphism between models
of a double theory without specified domain or codomain models.
 */
pub trait DblModelMapping {
    /// Type of objects in domain model.
    type DomOb: Eq;

    /// Type of morphisms in domain model.
    type DomMor: Eq;

    /// Type of objects in codomain model.
    type CodOb: Eq;

    /// Type of morphisms in codomain model.
    type CodMor: Eq;

    /// Applies the mapping to an object in the domain model.
    fn apply_ob(&self, x: &Self::DomOb) -> Option<Self::CodOb>;

    /// Applies the mapping to a morphism in the domain model.
    fn apply_mor(&self, m: &Self::DomMor) -> Option<Self::CodMor>;
}
