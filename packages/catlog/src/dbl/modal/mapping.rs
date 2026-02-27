//! Morphism between models of a modal double theory.

use crate::dbl::modal::{ModalMorType, ModalObType};
use crate::one::{FpFunctorData, QualifiedPath};
use crate::zero::{HashColumn, QualifiedName};

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
}
// In a discrete double model, the ob_types and mor_types are stored as hash_maps. In a modal
// double model, we want to also store the ob_ and mor_generators, which are HashFinSets, and

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stdlib::dec;
    use crate::stdlib::th_multicategory;
    use crate::validate::Validate;
    use std::rc::Rc;

    #[test]
    fn test_diagram() {
        let th = Rc::new(th_multicategory());
        println!("{}", dec(th.clone()));
        assert!(dec(th).validate().is_ok());
    }
}
