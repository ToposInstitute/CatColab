//! Diagrams in models of a modal double theory

#[cfg(feature = "serde-wasm")]
use tsify::declare;

// TODO use super
use crate::dbl::{
    modal::{ModalDblModelMapping, ModalOb},
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
use crate::zero::{column::Mapping, QualifiedName};

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
        // TODO is_vertex_assigned is expected QualifiedName but we git it ModalOb
        for e in domain.mor_generators() {
            let Some(g) = mapping.0.edge_map().apply_to_ref(&e) else {
                continue;
            };
            if !model.has_mor(&g) {
                continue;
            }

            if let Some(ob) = domain.clone().get_dom(&e) {
                let names: Vec<QualifiedName> = match ob {
                    ModalOb::Generator(name) => vec![name.clone()],
                    ModalOb::List(List, args) => {
                        args.into_iter().filter_map(|ob| ob.clone().generator()).collect()
                    }
                    _ => todo!(),
                };

                for name in names {
                    if !mapping.0.is_vertex_assigned(&name) {
                        mapping.assign_ob(name, model.dom(&g));
                    }
                }

                //                         if !mapping.0.is_vertex_assigned(&name) => {
                //                         mapping.assign_ob(name.clone(), model.dom(&g))
                //                     }
                //                     ModalOb::List(List, args) => args
                //                         .into_iter()
                //                         .filter(|ob: &ModalOb| {
                //                             ob.clone()
                //                                 .generator()
                //                                 .is_some_and(|name| !mapping.0.is_vertex_assigned(&name))
                //                         })
                //                         .map(|missing_ob| {
                //                             missing_ob
                //                                 .generator()
                //                                 .and_then(|name| mapping.assign_ob(name.clone(), model.dom(&g)))
                //                         }),
                //                     _ => todo!(),
                // }
            }

            // for ob in domain.clone().get_cod(&e) {
            //     match ob {
            //         ModalOb::Generator(name) if !ampping.0.is_vertex_assigned(&name) => {
            //             mapping.assign_ob(name.clone(), model.cod(&g))
            //         }
            //         ModalOb::List(List, args) => args
            //             .into_iter()
            //             .filter(|ob: &ModalOb| {
            //                 ob.clone()
            //                     .generator()
            //                     .is_some_and(|name| !ismapping.0.is_vertex_assigned(&name))
            //             })
            //             // why not just apply assign_ob to all the generators
            //             .map(|missing_ob| {
            //                 missing_ob
            //                     .generator()
            //                     .and_then(|name| mapping.assign_ob(name.clone(), model.cod(&g)))
            //             }),
            //         _ => todo!(),
            //     }
            // }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dbl::modal::ModalDblModel;
    use crate::dbl::model_diagram::DblModelDiagram;
    use crate::stdlib::dec;
    use crate::stdlib::th_multicategory;
    use crate::tt::{modelgen::Model, prelude::Path};
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

    // TODO
    #[test]
    fn infer_modal_model_diagram() {
        let th = Rc::new(th_multicategory());
        let Ok(Some(domain)) = Model::from_text(
            &th.clone().into(),
            "[
                u : Object,
                dot_u : Object,
                partial_t : Multihom[[u], dot_u]
            ]",
        )
        .map(|m| m.as_modal()) else {
            return ();
        };

        let mut f: ModalDblModelMapping = Default::default();
        f.assign_mor(name("partial_t"), name("partial_t").into());
        let mut diagram = DblModelDiagram(f, domain.clone());

        if let Ok(Some(heat_eq)) = Model::from_text(
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
        )
        .map(|m| m.as_modal())
        {
            diagram.infer_missing_from(&heat_eq);
            assert!(diagram.validate_in(&heat_eq).is_ok());
        }
    }
}
