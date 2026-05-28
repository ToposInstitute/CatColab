//! Morphism between models of a modal double theory.

use crate::dbl::modal::{ModalDblModel, ModalMor, ModalOb};
use crate::dbl::model::MutDblModel;
use crate::dbl::model_morphism::{DblModelMorphism, InvalidDblModelMorphism, MutDblModelMapping};
use crate::dbl::theory::Unital;
use crate::one::{
    FpFunctorData,
    category::{Category, FgCategory},
    graph::GraphMapping,
};
use crate::validate::{self, Validate};
use crate::zero::{HashColumn, Mapping, MutMapping, QualifiedName};

use nonempty::NonEmpty;

// TODO FpFunctorData on ModalDblModalMapping...?
type ModalDblModelMappingData =
    FpFunctorData<HashColumn<QualifiedName, ModalOb>, HashColumn<QualifiedName, ModalMor>>;

/// A mapping between models of a modal double theory.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ModalDblModelMapping(pub ModalDblModelMappingData);

impl MutDblModelMapping for ModalDblModelMapping {
    type ObGen = ModalOb;
    type MorGen = ModalMor;
    /// Constructs a new model mapping from a pair of hash maps.
    fn new(
        ob_pairs: impl IntoIterator<Item = (QualifiedName, ModalOb)>,
        mor_pairs: impl IntoIterator<Item = (QualifiedName, ModalMor)>,
    ) -> Self {
        Self(FpFunctorData::new(
            ob_pairs.into_iter().collect(),
            mor_pairs.into_iter().collect(),
        ))
    }

    /// Assigns an object generator, returning the previous assignment.
    fn assign_ob(&mut self, x: QualifiedName, y: ModalOb) -> Option<ModalOb> {
        self.0.ob_generator_map.set(x, y)
    }

    /// Assigns a morphism generator, returning the previous assignment.
    fn assign_mor(&mut self, e: QualifiedName, n: ModalMor) -> Option<ModalMor> {
        self.0.mor_generator_map.set(e, n)
    }

    /// Unassigns an object generator, returning the previous assignment.
    fn unassign_ob(&mut self, x: &QualifiedName) -> Option<ModalOb> {
        self.0.ob_generator_map.unset(x)
    }

    /// Unassigns a morphism generator, returning the previous assignment.
    fn unassign_mor(&mut self, e: &QualifiedName) -> Option<ModalMor> {
        self.0.mor_generator_map.unset(e)
    }

    // Finder of morphisms between two models of a modal double theory.
    // fn morphisms<'a>(
    //     dom: &'a ModalDblModel<Unital>,
    //     cod: &'a ModalDblModel<Unital>,
    // ) -> QualifiedName {
    //     todo!()
    // }
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
                if !self.0.is_vertex_assigned(&name) {
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
                self.0.apply_vertex(name.clone()).ok_or("Vertex {name} not found".to_string())
            }
            ModalOb::App(_, name) => {
                self.0.apply_vertex(name.clone()).ok_or("Vertex {name} not found".to_string())
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
        // DiscreteDblModelMapping is destructured at this step, but I've decided not to
        // destructure further out of convenience.
        let DblModelMorphism(mapping, dom, cod) = *self;

        let ob_errors = dom.ob_generators().filter_map(|v| {
            if mapping.0.vertex_map().apply_to_ref(&v).is_some_and(|w| cod.has_ob(&w)) {
                None
            } else {
                Some(InvalidDblModelMorphism::<QualifiedName, QualifiedName>::Ob(v))
            }
        });

        let mor_errors = dom.mor_generators().filter_map(|e| {
            // Check if the morphism is correct.
            let f = match mapping.0.edge_map().apply_to_ref(&e) {
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
