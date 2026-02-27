//! Morphism between models of a modal double theory.

use crate::dbl::discrete::DiscreteDblModel;
use crate::dbl::modal::{ModalMorType, ModalObType};
use crate::dbl::model::MutDblModel;
use crate::one::{FpFunctorData, QualifiedPath};
use crate::zero::{HashColumn, Mapping, MutMapping, QualifiedName};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ModalDblModelMapping(pub ModalDblModelMappingData);

type ModalDblModelMappingData =
    FpFunctorData<HashColumn<QualifiedName, ModalObType>, HashColumn<QualifiedName, ModalMorType>>;

impl ModalDblModelMapping {
    /// Constructs a new model mapping from a pair of hash maps.
    pub fn new(
        ob_pairs: impl IntoIterator<Item = (QualifiedName, ModalObType)>,
        mor_pairs: impl IntoIterator<Item = (QualifiedName, ModalMorType)>,
    ) -> Self {
        Self(FpFunctorData::new(
            ob_pairs.into_iter().collect(),
            mor_pairs.into_iter().collect(),
        ))
    }

    /// Assigns an object generator, returning the previous assignment.
    pub fn assign_ob(&mut self, x: QualifiedName, y: ModalObType) -> Option<ModalObType> {
        self.0.ob_generator_map.set(x, y)
    }

    /// Assigns a morphism generator, returning the previous assignment.
    pub fn assign_mor(&mut self, e: QualifiedName, n: ModalMorType) -> Option<ModalMorType> {
        self.0.mor_generator_map.set(e, n)
    }
}
// In a discrete double model, the ob_types and mor_types are stored as hash_maps. In a modal
// double model, we want to also store the ob_ and mor_generators, which are HashFinSets, and
