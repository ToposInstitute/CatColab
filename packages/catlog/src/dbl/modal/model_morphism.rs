//! Morphism between models of a modal double theory.

use crate::dbl::modal::{ModalDblModel, ModalMor, ModalOb};
use crate::dbl::model::MutDblModel;
use crate::dbl::model_morphism::{DblModelMorphism, InvalidDblModelMorphism, MutDblModelMapping};
use crate::dbl::theory::Unital;
use crate::one::{
    category::{Category, FgCategory},
    graph::GraphMapping,
};
use crate::validate::{self, Validate};
use crate::zero::{HashColumn, Mapping, MutMapping, QualifiedName};

use nonempty::NonEmpty;

/// A mapping between models of a modal double theory.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ModalDblModelMapping {
    ob_map: HashColumn<QualifiedName, ModalOb>,
    mor_map: HashColumn<QualifiedName, ModalMor>,
}

impl MutDblModelMapping for ModalDblModelMapping {
    type ObGen = ModalOb;
    type MorGen = ModalMor;
    /// Constructs a new model mapping from a pair of hash maps.
    fn new(
        ob_pairs: impl IntoIterator<Item = (QualifiedName, ModalOb)>,
        mor_pairs: impl IntoIterator<Item = (QualifiedName, ModalMor)>,
    ) -> Self {
        Self {
            ob_map: ob_pairs.into_iter().collect(),
            mor_map: mor_pairs.into_iter().collect(),
        }
    }

    /// Assigns an object generator, returning the previous assignment.
    fn assign_ob(&mut self, x: QualifiedName, y: ModalOb) -> Option<ModalOb> {
        self.ob_map.set(x, y)
    }

    /// Assigns a morphism generator, returning the previous assignment.
    fn assign_mor(&mut self, e: QualifiedName, n: ModalMor) -> Option<ModalMor> {
        self.mor_map.set(e, n)
    }

    /// Unassigns an object generator, returning the previous assignment.
    fn unassign_ob(&mut self, x: &QualifiedName) -> Option<ModalOb> {
        self.ob_map.unset(x)
    }

    /// Unassigns a morphism generator, returning the previous assignment.
    fn unassign_mor(&mut self, e: &QualifiedName) -> Option<ModalMor> {
        self.mor_map.unset(e)
    }
}

impl GraphMapping for ModalDblModelMapping
where
    HashColumn<QualifiedName, ModalOb>: Mapping,
    HashColumn<QualifiedName, ModalMor>: Mapping,
{
    type DomV = QualifiedName;
    type DomE = QualifiedName;
    type CodV = ModalOb;
    type CodE = ModalMor;
    type VertexMap = HashColumn<QualifiedName, ModalOb>;
    type EdgeMap = HashColumn<QualifiedName, ModalMor>;

    fn vertex_map(&self) -> &Self::VertexMap {
        &self.ob_map
    }
    fn edge_map(&self) -> &Self::EdgeMap {
        &self.mor_map
    }
}

impl ModalDblModelMapping {
    /// This checks if an object in the domain also exists in the model.
    pub fn infer_missing(&mut self, domain_ob: Option<&ModalOb>, model_ob: ModalOb) {
        if let Some(ob) = domain_ob {
            let names: Vec<QualifiedName> = match ob {
                ModalOb::Generator(name) => vec![name.clone()],
                ModalOb::App(_, name) => vec![name.clone()],
                ModalOb::List(_, args) => {
                    args.iter().filter_map(|ob| ob.clone().generator()).collect()
                }
            };

            for name in names {
                if !self.is_vertex_assigned(&name) {
                    match model_ob {
                        ref ob @ ModalOb::Generator(_) => self.assign_ob(name, ob.clone()),
                        ref ob @ ModalOb::App(_, _) => self.assign_ob(name, ob.clone()),
                        ModalOb::List(_, ref args) => match args.as_slice() {
                            [only] => self.assign_ob(name, only.clone()),
                            _ => todo!("What happens when we receive more than one arg?"),
                        },
                    };
                };
            }
        };
    }

    /// This applies a mapping onto a given object in the domain, returning the corresponding
    /// object in the codomain.
    fn apply_ob(&self, ob: ModalOb) -> Result<ModalOb, String> {
        match ob {
            ModalOb::Generator(name) => {
                self.apply_vertex(name.clone()).ok_or("Vertex {name} not found".to_string())
            }
            ModalOb::App(_, name) => {
                self.apply_vertex(name.clone()).ok_or("Vertex {name} not found".to_string())
            }
            ModalOb::List(list, args) => args
                .into_iter()
                .map(|name| self.apply_ob(name.clone()))
                .collect::<Result<Vec<ModalOb>, String>>()
                .map(|args| ModalOb::List(list, args)),
        }
    }
}

/// A morphism between models of a modal double theory.
// TODO kinds are fixed
pub type ModalDblModelMorphism<'a> =
    DblModelMorphism<'a, ModalDblModelMapping, ModalDblModel<Unital>, ModalDblModel<Unital>>;

impl<'a> ModalDblModelMorphism<'a> {
    /// Iterates over failures of the mapping to be a model morphism.
    pub fn iter_invalid(
        &self,
    ) -> impl Iterator<Item = InvalidDblModelMorphism<QualifiedName, QualifiedName>> + 'a + use<'a>
    {
        let DblModelMorphism(mapping, dom, cod) = *self;

        let ob_errors = dom.ob_generators().filter_map(|v| {
            if mapping.vertex_map().apply_to_ref(&v).is_some_and(|w| cod.has_ob(&w)) {
                None
            } else {
                Some(InvalidDblModelMorphism::<QualifiedName, QualifiedName>::Ob(v))
            }
        });

        let mor_errors = dom.mor_generators().filter_map(|e| {
            // Check if the morphism is correct.
            let f = match mapping.edge_map().apply_to_ref(&e) {
                Some(ModalMor::Generator(f)) if cod.has_mor(&ModalMor::Generator(f.clone())) => f,
                Some(ModalMor::Generator(f)) => return Some(InvalidDblModelMorphism::Mor(f)),
                _ => return None,
            };

            let dom_check = dom.get_dom(&e).zip(cod.get_dom(&f)).and_then(|(left, right)| {
                (mapping.apply_ob(left.clone()) != Ok(right.clone()))
                    .then_some(InvalidDblModelMorphism::Dom(e.clone()))
            });

            let cod_check = dom.get_cod(&e).zip(cod.get_cod(&f)).and_then(|(left, right)| {
                (mapping.apply_ob(left.clone()) != Ok(right.clone()))
                    .then_some(InvalidDblModelMorphism::Cod(e))
            });

            // we're short-circuiting errors here. i'd like to collect them into one error message
            // in the future
            dom_check.or(cod_check)
        });

        ob_errors.chain(mor_errors)
    }
}

impl Validate for ModalDblModelMorphism<'_> {
    type ValidationError = InvalidDblModelMorphism<QualifiedName, QualifiedName>;

    fn validate(&self) -> Result<(), NonEmpty<Self::ValidationError>> {
        validate::wrap_errors(self.iter_invalid())
    }
}

#[cfg(test)]
mod tests {
    use std::rc::Rc;

    use super::*;
    use crate::stdlib::*;
    use crate::tt::modelgen::Model;
    use crate::zero::name;

    #[test]
    fn validate_bad_modal_model_mapping() {
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

        let d = DblModelMorphism(&f, &heat_eq, &dec);

        let err = validate::wrap_errors(
            vec![(InvalidDblModelMorphism::Dom(name("multiplication")))].into_iter(),
        );
        assert_eq!(d.validate(), err);
    }
}
