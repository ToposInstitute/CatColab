//! Morphism between models of a modal double theory.

use crate::dbl::discrete::DblModelMorphism;
use crate::dbl::modal::{ModalDblModel, ModalMor, ModalOb};
use crate::dbl::model::DblModel;
use crate::dbl::model_morphism::InvalidDblModelMorphism;
use crate::one::{FpFunctorData, InvalidFpFunctor};
use crate::validate::{self, Validate};
use crate::zero::{HashColumn, MutMapping, QualifiedName};

use nonempty::NonEmpty;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ModalDblModelMapping(pub ModalDblModelMappingData);

type ModalDblModelMappingData =
    FpFunctorData<HashColumn<QualifiedName, ModalOb>, HashColumn<QualifiedName, ModalMor>>;

impl ModalDblModelMapping {
    /// Constructs a new model mapping from a pair of hash maps.
    pub fn new(
        ob_pairs: impl IntoIterator<Item = (QualifiedName, ModalOb)>,
        mor_pairs: impl IntoIterator<Item = (QualifiedName, ModalMor)>,
    ) -> Self {
        Self(FpFunctorData::new(
            ob_pairs.into_iter().collect(),
            mor_pairs.into_iter().collect(),
        ))
    }

    /// Assigns an object generator, returning the previous assignment.
    pub fn assign_ob(&mut self, x: QualifiedName, y: ModalOb) -> Option<ModalOb> {
        self.0.ob_generator_map.set(x, y)
    }

    /// Assigns a morphism generator, returning the previous assignment.
    pub fn assign_mor(&mut self, e: QualifiedName, n: ModalMor) -> Option<ModalMor> {
        self.0.mor_generator_map.set(e, n)
    }
}

/// A morphism between models of a modal double theory.
pub type ModalDblModelMorphism<'a> =
    DblModelMorphism<'a, ModalDblModelMapping, ModalDblModel, ModalDblModel>;

impl<'a> ModalDblModelMorphism<'a> {
    /// Iterates over failures of the mapping to be a model morphism.
    pub fn iter_invalid(
        &self,
    ) -> impl Iterator<Item = InvalidDblModelMorphism<QualifiedName, QualifiedName>> + 'a + use<'a>
    {
        // vec![].into_iter()
        let DblModelMorphism(ModalDblModelMapping(mapping), dom, cod) = *self;
        // let category_errors: Vec<_> = mapping
        //     .functor_into(&cod.category) // TODO
        //     .iter_invalid_on(&dom.category)
        //     .map(|err| match err {
        //         InvalidFpFunctor::ObGen(x) => InvalidDblModelMorphism::Ob(x),
        //         InvalidFpFunctor::MorGen(m) => InvalidDblModelMorphism::Mor(m),
        //         InvalidFpFunctor::Dom(m) => InvalidDblModelMorphism::Dom(m),
        //         InvalidFpFunctor::Cod(m) => InvalidDblModelMorphism::Cod(m),
        //         InvalidFpFunctor::Eq(id) => InvalidDblModelMorphism::Eq(id),
        //     })
        //     .collect();
        // let ob_type_errors = dom.ob_generators().filter_map(|x| {
        //     if let Some(y) = mapping.ob_generator_map.get(&x)
        //         && cod.has_ob(y)
        //         && dom.ob_type(&x) != cod.ob_type(y)
        //     {
        //         Some(InvalidDblModelMorphism::ObType(x))
        //     } else {
        //         None
        //     }
        // });
        let th_cat = cod.theory();
        dbg!(th_cat);
        // let mor_type_errors = dom.mor_generators().filter_map(move |f| {
        //     if let Some(g) = mapping.mor_generator_map.get(&f)
        //         && cod.has_mor(g)
        //         && !th_cat.0.morphisms_are_equal(dom.mor_generator_type(&f), cod.mor_type(g))
        //     {
        //         Some(InvalidDblModelMorphism::MorType(f))
        //     } else {
        //         None
        //     }
        // });
        vec![].into_iter()
        // category_errors.into_iter().chain(ob_type_errors).chain(mor_type_errors)
    }
}

impl Validate for ModalDblModelMorphism<'_> {
    type ValidationError = InvalidDblModelMorphism<QualifiedName, QualifiedName>;

    fn validate(&self) -> Result<(), NonEmpty<Self::ValidationError>> {
        validate::wrap_errors(self.iter_invalid())
    }
}
