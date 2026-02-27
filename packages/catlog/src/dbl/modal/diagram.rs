//! Diagrams in models of a modal double theory

// TODO use super
use crate::dbl::modal::ModalDblModelMapping;
use crate::dbl::model::ModalDblModel;
use crate::dbl::model::MutDblModel;
use crate::dbl::model_diagram::*;

/// A diagram i a model of a modal double theoruy.
pub type ModalDblModelDiagram = DblModelDiagram<ModalDblModelMapping, ModalDblModel>;

/// A failure to be valid in a diagram in a model of a discrete double theory.
#[cfg_attr(feature = "serde-wasm", declare)]
pub type InvalidModalDblModelDiagram =
    InvalidDblModelDiagram<InvalidDblModel, InvalidDblModelMorphism<QualifiedName, QualifiedName>>;

impl ModalDblModelDiagram {
    /// Validates that the diagram is well-defined in the given model.
    ///
    /// Assumes that the model is valid. If it is not, this function may panic.
    pub fn validate_in(
        &self,
        model: &ModalDblModel,
    ) -> Result<(), NonEmpty<InvalidModalDblModelDiagram>> {
        validate::wrap_errors(self.iter_invalid_in(model))
    }

    /// Iterates over failures of the diagram to be valid in the given model.
    pub fn iter_invalid_in<'a>(
        &'a self,
        model: &'a ModalDblModel,
    ) -> impl Iterator<Item = InvalidModalDblModelDiagram> + 'a {
        // TODO iter_invalid
        let mut dom_errs = self.1.iter_invalid().peekable();
        if dom_errs.peek().is_some() {
            Either::Left(dom_errs.map(InvalidDblModelDiagram::Dom))
        } else {
            let morphism = DblModelMorphism(&self.0, &self.1, model);
            Either::Right(morphism.iter_invalid().map(InvalidDblModelDiagram::Map))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dbl::modal::{ModalDblModel, ModalMorType, ModalObType};
    use crate::dbl::model::MutDblModel;
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

        let mut domain = ModalDblModel::new(th.clone());
        // TODO replace second arg w ob_type...
        let ob_type = ModalObType::new(name("Object"));
        domain.add_ob(name("u"), ob_type.clone());
        domain.add_ob(name("dot-u"), ob_type.clone());
        let mut f: ModalDblModelMapping = Default::default();
        let form0 = ModalObType::new(name("Form0"));
        f.assign_ob(name("u"), form0.clone());
        f.assign_ob(name("dot-u"), form0);

        // `f` needs to be a DblModelMapping
        let mut diagram = DblModelDiagram(f, domain.clone());
        assert!(diagram.validate_in(&model).is_ok());
    }
}
