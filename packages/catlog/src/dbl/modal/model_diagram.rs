//! Diagrams in models of a modal double theory.

#[cfg(feature = "serde-wasm")]
use tsify::declare;

use crate::dbl::{
    modal::ModalDblModelMapping,
    model::{InvalidDblModel, ModalDblModel, MutDblModel},
    model_diagram::*,
    model_morphism::{DblModelMorphism, InvalidDblModelMorphism},
    theory::Unital,
};
use crate::one::{
    category::{Category, FgCategory},
    graph::GraphMapping,
};
use crate::validate;
use crate::zero::{QualifiedName, column::Mapping};

use itertools::Either;
use nonempty::NonEmpty;

/// A diagram is a model of a modal double theoruy.
pub type ModalDblModelDiagram = DblModelDiagram<ModalDblModelMapping, ModalDblModel<Unital>>;

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
        model: &ModalDblModel<Unital>,
    ) -> Result<(), NonEmpty<InvalidModalDblModelDiagram>> {
        validate::wrap_errors(self.iter_invalid_in(model))
    }

    /// Iterates over failures of the diagram to be valid in the given model.
    pub fn iter_invalid_in<'a>(
        &'a self,
        model: &'a ModalDblModel<Unital>,
    ) -> impl Iterator<Item = InvalidModalDblModelDiagram> + 'a {
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
    pub fn infer_missing_from(&mut self, model: &ModalDblModel<Unital>) {
        let (mapping, domain) = self.into();
        domain.infer_missing();
        for e in domain.mor_generators() {
            let Some(g) = mapping.edge_map().apply_to_ref(&e) else {
                continue;
            };
            if !model.has_mor(&g) {
                continue;
            }

            mapping.infer_missing(domain.clone().get_dom(&e), model.dom(&g));
            mapping.infer_missing(domain.clone().get_cod(&e), model.cod(&g));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dbl::model_diagram::DblModelDiagram;
    use crate::dbl::model_morphism::MutDblModelMapping;
    use crate::stdlib::dec;
    use crate::stdlib::th_multicategory;
    use crate::tt::modelgen::Model;
    use crate::validate;
    use crate::zero::name;
    use std::rc::Rc;

    #[test]
    fn validate_modal_model_diagram() {
        let th = Rc::new(th_multicategory());
        let dec = dec(th.clone());
        // TODO does not like numbers
        let heat_eq = Model::from_text(
            &th.into(),
            "[
                u : Object,
                dot_u : Object,
                k : Object,
                anon : Object,
                partial_t : Multihom[[u], dot_u],
                laplacian : Multihom[[u], anon],
                multiplication : Multihom[[k, anon], dot_u]
            ]",
        );
        let heat_eq = heat_eq.unwrap().as_modal().unwrap();

        let mut f: ModalDblModelMapping = Default::default();
        f.assign_ob(name("u"), name("Form0").into());
        f.assign_ob(name("dot_u"), name("Form0").into());
        f.assign_ob(name("k"), name("Form0").into());
        f.assign_ob(name("anon"), name("Form0").into());
        f.assign_mor(name("laplacian"), name("laplacian").into());
        f.assign_mor(name("partial_t"), name("partial_t0").into());
        f.assign_mor(name("multiplication"), name("multiplication").into());

        let diagram = DblModelDiagram(f, heat_eq);
        assert!(diagram.validate_in(&dec).is_ok());
    }

    #[test]
    fn validate_bad_modal_model_diagram() {
        let th = Rc::new(th_multicategory());
        let dec = dec(th.clone());
        // TODO does not like numbers
        let heat_eq = Model::from_text(
            &th.into(),
            "[
                u : Object,
                dot_u : Object,
                k : Object,
                anon : Object,
                partial_t : Multihom[[u], dot_u],
                laplacian : Multihom[[u], anon],
                multiplication : Multihom[[k, anon], dot_u]
            ]",
        );
        let heat_eq = heat_eq.unwrap().as_modal().unwrap();

        let mut f: ModalDblModelMapping = Default::default();
        f.assign_ob(name("u"), name("Form0").into());
        f.assign_ob(name("dot_u"), name("Form0").into());
        f.assign_ob(name("k"), name("Form1").into()); // this is intentionally wrong.
        f.assign_ob(name("anon"), name("Form0").into());
        f.assign_mor(name("laplacian"), name("laplacian").into());
        f.assign_mor(name("partial_t"), name("partial_t0").into());
        f.assign_mor(name("multiplication"), name("multiplication").into());

        let diagram = DblModelDiagram(f, heat_eq);
        let err = validate::wrap_errors(
            vec![InvalidDblModelDiagram::Map(InvalidDblModelMorphism::Dom(name(
                "multiplication",
            )))]
            .into_iter(),
        );
        assert_eq!(diagram.validate_in(&dec), err);
    }

    #[test]
    fn infer_modal_model_diagram() {
        let th = Rc::new(th_multicategory());
        let domain = Model::from_text(
            &th.clone().into(),
            "[
                u : Object,
                dot_u : Object,
                partial_t : Multihom[[u], dot_u]
            ]",
        )
        .unwrap()
        .as_modal()
        .unwrap();

        let mut f: ModalDblModelMapping = Default::default();
        f.assign_mor(name("partial_t"), name("partial_t0").into());
        let mut diagram = DblModelDiagram(f, domain.clone());

        let dec = dec(th.clone());
        diagram.infer_missing_from(&dec);
        assert!(diagram.validate_in(&dec).is_ok());
    }
}
