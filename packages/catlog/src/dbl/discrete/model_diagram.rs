//! Diagrams in models of a discrete double theory.

use std::hash::Hash;

use itertools::Either;
use nonempty::NonEmpty;

#[cfg(feature = "serde-wasm")]
use tsify::declare;

use crate::dbl::{model::*, model_diagram::*, model_morphism::*};
use crate::one::{Category, FgCategory, GraphMapping};
use crate::validate;
use crate::zero::Mapping;

/// A diagram in a model of a discrete double theory.
pub type DiscreteDblModelDiagram<DomId, CodId, Cat> =
    DblModelDiagram<DiscreteDblModelMapping<DomId, CodId>, DiscreteDblModel<DomId, Cat>>;

/// A failure to be valid in a diagram in a model of a discrete double theory.
#[cfg_attr(feature = "serde-wasm", declare)]
pub type InvalidDiscreteDblModelDiagram<DomId> =
    InvalidDblModelDiagram<InvalidDblModel<DomId>, InvalidDblModelMorphism<DomId, DomId>>;

impl<DomId, CodId, Cat> DiscreteDblModelDiagram<DomId, CodId, Cat>
where
    DomId: Eq + Clone + Hash,
    CodId: Eq + Clone + Hash,
    Cat: FgCategory,
    Cat::Ob: Hash,
    Cat::Mor: Hash,
{
    /** Validates that the diagram is well-defined in the given model.

    Assumes that the model is valid. If it is not, this function may panic.
     */
    pub fn validate_in(
        &self,
        model: &DiscreteDblModel<CodId, Cat>,
    ) -> Result<(), NonEmpty<InvalidDiscreteDblModelDiagram<DomId>>> {
        validate::wrap_errors(self.iter_invalid_in(model))
    }

    /// Iterates over failures of the diagram to be valid in the given model.
    pub fn iter_invalid_in<'a>(
        &'a self,
        model: &'a DiscreteDblModel<CodId, Cat>,
    ) -> impl Iterator<Item = InvalidDiscreteDblModelDiagram<DomId>> + 'a {
        let mut dom_errs = self.1.iter_invalid().peekable();
        if dom_errs.peek().is_some() {
            Either::Left(dom_errs.map(InvalidDblModelDiagram::Dom))
        } else {
            let morphism = DblModelMorphism(&self.0, &self.1, model);
            Either::Right(morphism.iter_invalid().map(InvalidDblModelDiagram::Map))
        }
    }

    /** Infer missing data in the diagram from the model, where possible.

    Assumes that the model is valid.
     */
    pub fn infer_missing_from(&mut self, model: &DiscreteDblModel<CodId, Cat>) {
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
    use ustr::ustr;

    use super::*;
    use crate::one::Path;
    use crate::stdlib::*;

    #[test]
    fn validate_model_diagram() {
        let th = Rc::new(th_signed_category());
        let pos_loop = positive_loop(th.clone());
        let neg_loop = negative_loop(th.clone());

        let mut f: DiscreteDblModelMapping<_, _> = DiscreteDblModelMapping::default();
        f.assign_ob(ustr("x"), ustr("x"));
        f.assign_mor(ustr("loop"), Path::pair(ustr("loop"), ustr("loop")));
        let diagram = DblModelDiagram(f, pos_loop);
        assert!(diagram.validate_in(&neg_loop).is_ok());
    }

    #[test]
    fn infer_model_diagram() {
        let th = Rc::new(th_schema());
        let mut domain = DiscreteDblModel::new(th.clone());
        domain.add_mor('f', 'x', 'y', ustr("Attr").into());
        let mut f: DiscreteDblModelMapping<_, _> = DiscreteDblModelMapping::default();
        f.assign_mor('f', Path::single(ustr("attr")));
        let mut diagram = DblModelDiagram(f, domain);

        let model = walking_attr(th);
        diagram.infer_missing_from(&model);
        assert!(diagram.validate_in(&model).is_ok());
    }
}
