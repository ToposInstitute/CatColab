//! Morphism between models of a modal double theory.

use crate::dbl::discrete::DiscreteDblModel;
use crate::dbl::modal::{ModalMorType, ModalObType};
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
    pub fn assign_ob(&mut self, x: QualifiedName, y: ModalObType) -> Option<QualifiedName> {
        self.0.ob_generator_map.set(x, y)
    }

    /// Assigns a morphism generator, returning the previous assignment.
    pub fn assign_mor(&mut self, e: QualifiedName, n: ModalMorType) -> Option<QualifiedPath> {
        self.0.mor_generator_map.set(e, n)
    }
}
// In a discrete double model, the ob_types and mor_types are stored as hash_maps. In a modal
// double model, we want to also store the ob_ and mor_generators, which are HashFinSets, and

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dbl::model_diagram::DblModelDiagram;
    use crate::stdlib::dec;
    use crate::stdlib::th_multicategory;
    use crate::validate::Validate;
    use crate::zero::name;
    use std::rc::Rc;

    #[test]
    fn test_diagram() {
        let th = Rc::new(th_multicategory());
        let model = dec(th.clone());

        let mut domain = DiscreteDblModel::new(th.clone());
        domain.add_ob(name("u"), name("Form0"));
        domain.add_ob(name("dot-u"), name("Form0"));
        let mut f: ModalDblModelMapping = Default::default();
        f.assign_ob(name("u"), name("Form0"));
        f.assign_ob(name("dot-u"), name("Form0"));

        let mut diagram = DblModelDiagram(f, domain.clone());
        // assert!(diagram.validate_in(&model).is_ok());
    }
}
