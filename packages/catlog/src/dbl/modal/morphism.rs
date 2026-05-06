//! Morphism between models of a modal double theory.

use crate::dbl::discrete::DblModelMorphism;
use crate::dbl::modal::{ModalDblModel, ModalMor, ModalOb};
use crate::dbl::model::{DblModel, FpDblModel};
use crate::dbl::model_morphism::InvalidDblModelMorphism;
use crate::dbl::theory::Unital;
use crate::one::{
    category::{Category, FgCategory},
    FpFunctorData, InvalidFpFunctor,
};
use crate::validate::{self, Validate};
use crate::zero::{HashColumn, MutMapping, QualifiedName};

use nonempty::NonEmpty;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ModalDblModelMapping(pub ModalDblModelMappingData);

type ModalDblModelMappingData =
    FpFunctorData<HashColumn<QualifiedName, ModalOb>, HashColumn<QualifiedName, ModalMor>>;

impl ModalDblModelMapping {
    /// Constructs a new model mapping from a pair of hash maps.
    pub fn new(
        ob_pairs: impl IntoIterator<Item = (QualifiedName, ModalOb)>,
        mor_pairs: impl IntoIterator<Item = (QualifiedName, ModalMor)>,
    ) -> Self {
        Self(FpFunctorData::new(
            ob_pairs.into_iter().collect(),
            mor_pairs.into_iter().collect(),
        ))
    }

    /// Assigns an object generator, returning the previous assignment.
    pub fn assign_ob(&mut self, x: QualifiedName, y: ModalOb) -> Option<ModalOb> {
        self.0.ob_generator_map.set(x, y)
    }

    /// Assigns a morphism generator, returning the previous assignment.
    pub fn assign_mor(&mut self, e: QualifiedName, n: ModalMor) -> Option<ModalMor> {
        self.0.mor_generator_map.set(e, n)
    }
}

/// A morphism between models of a modal double theory.
/// TODO kinds are fixed
pub type ModalDblModelMorphism<'a> =
    DblModelMorphism<'a, ModalDblModelMapping, ModalDblModel<Unital>, ModalDblModel<Unital>>;

impl<'a> ModalDblModelMorphism<'a> {
    /// Iterates over failures of the mapping to be a model morphism.
    pub fn iter_invalid(
        &self,
    ) -> impl Iterator<Item = InvalidDblModelMorphism<QualifiedName, QualifiedName>> + 'a + use<'a>
    {
        vec![].into_iter()
    }
}

impl Validate for ModalDblModelMorphism<'_> {
    type ValidationError = InvalidDblModelMorphism<QualifiedName, QualifiedName>;

    fn validate(&self) -> Result<(), NonEmpty<Self::ValidationError>> {
        validate::wrap_errors(self.iter_invalid())
    }
}
