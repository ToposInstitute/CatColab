//! Diagrams in models of a discrete double theory.

use itertools::Either;
use nonempty::NonEmpty;

#[cfg(feature = "serde-wasm")]
use tsify::declare;

use crate::dbl::{model::*, model_diagram::*, model_morphism::*};
use crate::one::{Category, FgCategory, GraphMapping};
use crate::validate;
use crate::zero::{Mapping, QualifiedName};

/// A diagram in a model of a discrete double theory.
pub type DiscreteDblModelDiagram = DblModelDiagram<DiscreteDblModelMapping, DiscreteDblModel>;

/// A failure to be valid in a diagram in a model of a discrete double theory.
#[cfg_attr(feature = "serde-wasm", declare)]
pub type InvalidDiscreteDblModelDiagram =
    InvalidDblModelDiagram<InvalidDblModel, InvalidDblModelMorphism<QualifiedName, QualifiedName>>;

impl DiscreteDblModelDiagram {
    /// Validates that the diagram is well-defined in the given model.
    ///
    /// Assumes that the model is valid. If it is not, this function may panic.
    pub fn validate_in(
        &self,
        model: &DiscreteDblModel,
    ) -> Result<(), NonEmpty<InvalidDiscreteDblModelDiagram>> {
        validate::wrap_errors(self.iter_invalid_in(model))
    }

    /// Iterates over failures of the diagram to be valid in the given model.
    pub fn iter_invalid_in<'a>(
        &'a self,
        model: &'a DiscreteDblModel,
    ) -> impl Iterator<Item = InvalidDiscreteDblModelDiagram> + 'a {
        let mut dom_errs = self.1.iter_invalid().peekable();
        if dom_errs.peek().is_some() {
            Either::Left(dom_errs.map(InvalidDblModelDiagram::Dom))
        } else {
            let morphism = DblModelMorphism(&self.0, &self.1, model);
            Either::Right(morphism.iter_invalid().map(InvalidDblModelDiagram::Map))
        }
    }

    /// Infer missing data in the diagram from the model, where possible.
    ///
    /// Assumes that the model is valid.
    pub fn infer_missing_from(&mut self, model: &DiscreteDblModel) {
        let (mapping, domain) = self.into();
        domain.infer_missing();
        for e in domain.mor_generators() {
            let Some(g) = mapping.0.edge_map().apply_to_ref(&e) else {
                continue;
            };
            if !model.has_mor(&g) {
                continue;
            }
            if let Some(x) = domain.get_dom(&e).filter(|x| !mapping.0.is_vertex_assigned(x)) {
                mapping.assign_ob(x.clone(), model.dom(&g));
            }
            if let Some(x) = domain.get_cod(&e).filter(|x| !mapping.0.is_vertex_assigned(x)) {
                mapping.assign_ob(x.clone(), model.cod(&g));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::rc::Rc;

    use super::*;
    use crate::stdlib::*;
    use crate::{one::Path, zero::name};

    #[test]
    fn validate_model_diagram() {
        let th = Rc::new(th_signed_category());
        let pos_loop = positive_loop(th.clone());
        let neg_loop = negative_loop(th.clone());

        let mut f: DiscreteDblModelMapping = Default::default();
        f.assign_ob(name("x"), name("x"));
        f.assign_mor(name("loop"), Path::pair(name("loop"), name("loop")));
        let diagram = DblModelDiagram(f, pos_loop);
        assert!(diagram.validate_in(&neg_loop).is_ok());
    }

    #[test]
    fn infer_model_diagram() {
        let th = Rc::new(th_schema());
        let mut domain = DiscreteDblModel::new(th.clone());
        domain.add_mor(name("f"), name("x"), name("y"), name("Attr").into());
        let mut f: DiscreteDblModelMapping = Default::default();
        f.assign_mor(name("f"), Path::single(name("attr")));
        let mut diagram = DblModelDiagram(f, domain.clone());

        let model = walking_attr(th);
        diagram.infer_missing_from(&model);
        assert!(diagram.validate_in(&model).is_ok());
    }
}
