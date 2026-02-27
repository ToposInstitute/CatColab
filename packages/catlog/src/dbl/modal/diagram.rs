//! Diagrams in models of a modal double theory

// TODO use super
use crate::dbl::modal::ModalDblModel;
use crate::dbl::modal::ModalDblModelMapping;
use crate::dbl::model_diagram::*;

/// A diagram i a model of a modal double theoruy.
pub type ModalDblModelDiagram = DblModelDiagram<ModalDblModelMapping, ModalDblModel>;

impl ModalDblModelDiagram {}

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
