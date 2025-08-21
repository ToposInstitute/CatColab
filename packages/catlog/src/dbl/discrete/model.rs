//! Models of discrete double theories.

use std::hash::Hash;
use std::rc::Rc;

use derivative::Derivative;
use ustr::Ustr;

use super::theory::DiscreteDblTheory;
use crate::dbl::{category::*, model::*, theory::DblTheory};
use crate::one::{fp_category::FpCategory, *};
use crate::validate::{self, Validate};
use crate::zero::*;

/** A finitely presented model of a discrete double theory.

Since discrete double theory has only identity operations, such a model is a
finite presentation of a category sliced over the object and morphism types
comprising the theory. A type theorist would call it a ["displayed
category"](https://ncatlab.org/nlab/show/displayed+category).
*/
#[derive(Clone, Debug, Derivative)]
#[derivative(PartialEq(bound = "Id: Eq + Hash"))]
#[derivative(Eq(bound = "Id: Eq + Hash"))]
pub struct DiscreteDblModel<Id> {
    #[derivative(PartialEq(compare_with = "Rc::ptr_eq"))]
    theory: Rc<DiscreteDblTheory>,
    pub(crate) category: FpCategory<Id, Id>,
    ob_types: IndexedHashColumn<Id, QualifiedName>,
    mor_types: IndexedHashColumn<Id, QualifiedPath>,
}

/// A model of a discrete double theory where both theoy and model have keys of
/// type `Ustr`.
pub type UstrDiscreteDblModel = DiscreteDblModel<Ustr>;

impl<Id: Eq + Clone + Hash> DiscreteDblModel<Id> {
    /// Creates an empty model of the given theory.
    pub fn new(theory: Rc<DiscreteDblTheory>) -> Self {
        Self {
            theory,
            category: Default::default(),
            ob_types: Default::default(),
            mor_types: Default::default(),
        }
    }

    /// Gets reference-counting pointer to the theory that this model is of.
    pub fn theory_rc(&self) -> Rc<DiscreteDblTheory> {
        self.theory.clone()
    }

    /// Returns the underlying graph of the model.
    pub fn generating_graph(&self) -> &(impl FinGraph<V = Id, E = Id> + use<Id>) {
        self.category.generators()
    }

    /// Is the model freely generated?
    pub fn is_free(&self) -> bool {
        self.category.is_free()
    }

    /// Adds a path equation to the model.
    pub fn add_equation(&mut self, eq: PathEq<Id, Id>) {
        self.category.add_equation(eq);
    }

    /// Iterates over failures of model to be well defined.
    pub fn iter_invalid(&self) -> impl Iterator<Item = InvalidDblModel<Id>> + '_ {
        type Invalid<Id> = InvalidDblModel<Id>;
        let category_errors = self.category.iter_invalid().map(|err| match err {
            InvalidFpCategory::Dom(e) => Invalid::Dom(e),
            InvalidFpCategory::Cod(e) => Invalid::Cod(e),
            InvalidFpCategory::Eq(eq, errs) => Invalid::Eq(eq, errs),
        });
        let ob_type_errors = self.category.ob_generators().filter_map(|x| {
            if self.theory.has_ob_type(&self.ob_type(&x)) {
                None
            } else {
                Some(Invalid::ObType(x))
            }
        });
        let mor_type_errors = self.category.mor_generators().flat_map(|e| {
            let mut errs = Vec::new();
            let mor_type = self.mor_generator_type(&e);
            if self.theory.has_mor_type(&mor_type) {
                if self.category.get_dom(&e).is_some_and(|x| {
                    self.has_ob(x) && self.ob_type(x) != self.theory.src(&mor_type)
                }) {
                    errs.push(Invalid::DomType(e.clone()));
                }
                if self.category.get_cod(&e).is_some_and(|x| {
                    self.has_ob(x) && self.ob_type(x) != self.theory.tgt(&mor_type)
                }) {
                    errs.push(Invalid::CodType(e));
                }
            } else {
                errs.push(Invalid::MorType(e));
            }
            errs.into_iter()
        });
        category_errors.chain(ob_type_errors).chain(mor_type_errors)
    }

    /** Infer missing data in the model, where possible.

    Objects used in the domain or codomain of morphisms, but not contained as
    objects of the model, are added and their types are inferred. It is not
    always possible to do this consistently, so it is important to `validate`
    the model even after calling this method.
    */
    pub fn infer_missing(&mut self) {
        let edges: Vec<_> = self.mor_generators().collect();
        for e in edges {
            if let Some(x) = self.get_dom(&e).filter(|x| !self.has_ob(x)) {
                let ob_type = self.theory.src(&self.mor_generator_type(&e));
                self.add_ob(x.clone(), ob_type);
            }
            if let Some(x) = self.get_cod(&e).filter(|x| !self.has_ob(x)) {
                let ob_type = self.theory.tgt(&self.mor_generator_type(&e));
                self.add_ob(x.clone(), ob_type);
            }
        }
    }

    /// Migrate model forward along a map between discrete double theories.
    pub fn push_forward<F>(&mut self, f: &F, new_theory: Rc<DiscreteDblTheory>)
    where
        F: CategoryMap<
                DomOb = QualifiedName,
                DomMor = QualifiedPath,
                CodOb = QualifiedName,
                CodMor = QualifiedPath,
            >,
    {
        self.ob_types = std::mem::take(&mut self.ob_types).postcompose(f.ob_map());
        self.mor_types = std::mem::take(&mut self.mor_types).postcompose(f.mor_map());
        self.theory = new_theory;
    }
}

impl<Id: Eq + Clone + Hash> Category for DiscreteDblModel<Id> {
    type Ob = Id;
    type Mor = Path<Id, Id>;

    fn has_ob(&self, x: &Self::Ob) -> bool {
        self.category.has_ob(x)
    }
    fn has_mor(&self, m: &Self::Mor) -> bool {
        self.category.has_mor(m)
    }
    fn dom(&self, m: &Self::Mor) -> Self::Ob {
        self.category.dom(m)
    }
    fn cod(&self, m: &Self::Mor) -> Self::Ob {
        self.category.cod(m)
    }
    fn compose(&self, path: Path<Self::Ob, Self::Mor>) -> Self::Mor {
        self.category.compose(path)
    }
}

impl<Id: Eq + Clone + Hash> FgCategory for DiscreteDblModel<Id> {
    type ObGen = Id;
    type MorGen = Id;

    fn ob_generators(&self) -> impl Iterator<Item = Self::ObGen> {
        self.category.ob_generators()
    }
    fn mor_generators(&self) -> impl Iterator<Item = Self::MorGen> {
        self.category.mor_generators()
    }
    fn mor_generator_dom(&self, f: &Self::MorGen) -> Self::Ob {
        self.category.mor_generator_dom(f)
    }
    fn mor_generator_cod(&self, f: &Self::MorGen) -> Self::Ob {
        self.category.mor_generator_cod(f)
    }
}

impl<Id: Eq + Clone + Hash> DblModel for DiscreteDblModel<Id> {
    type ObType = QualifiedName;
    type MorType = QualifiedPath;
    type ObOp = QualifiedName;
    type MorOp = Path<QualifiedName, QualifiedPath>;
    type Theory = DiscreteDblTheory;

    fn theory(&self) -> &Self::Theory {
        &self.theory
    }

    fn ob_act(&self, x: Self::Ob, _: &Self::ObOp) -> Self::Ob {
        x
    }
    fn mor_act(&self, path: Path<Self::Ob, Self::Mor>, _: &Self::MorOp) -> Self::Mor {
        path.flatten()
    }

    fn ob_type(&self, ob: &Self::Ob) -> Self::ObType {
        self.ob_generator_type(ob)
    }
    fn mor_type(&self, mor: &Self::Mor) -> Self::MorType {
        let types =
            mor.clone().map(|x| self.ob_generator_type(&x), |m| self.mor_generator_type(&m));
        self.theory.compose_types(types).expect("Morphism types should have composite")
    }
}

impl<Id: Eq + Clone + Hash> FgDblModel for DiscreteDblModel<Id> {
    fn ob_generator_type(&self, ob: &Self::ObGen) -> Self::ObType {
        self.ob_types.apply_to_ref(ob).expect("Object should have type")
    }
    fn mor_generator_type(&self, mor: &Self::MorGen) -> Self::MorType {
        self.mor_types.apply_to_ref(mor).expect("Morphism should have type")
    }

    fn ob_generators_with_type(&self, typ: &Self::ObType) -> impl Iterator<Item = Self::ObGen> {
        self.ob_types.preimage(typ)
    }
    fn mor_generators_with_type(&self, typ: &Self::MorType) -> impl Iterator<Item = Self::MorGen> {
        self.mor_types.preimage(typ)
    }
}

impl<Id: Eq + Clone + Hash> MutDblModel for DiscreteDblModel<Id> {
    fn add_ob(&mut self, x: Id, ob_type: Self::ObType) {
        self.ob_types.set(x.clone(), ob_type);
        self.category.add_ob_generator(x);
    }

    fn add_mor(&mut self, f: Id, dom: Id, cod: Id, mor_type: Self::MorType) {
        self.mor_types.set(f.clone(), mor_type);
        self.category.add_mor_generator(f, dom, cod);
    }

    fn make_mor(&mut self, f: Id, mor_type: Self::MorType) {
        self.mor_types.set(f.clone(), mor_type);
        self.category.make_mor_generator(f);
    }

    fn get_dom(&self, f: &Id) -> Option<&Id> {
        self.category.get_dom(f)
    }
    fn get_cod(&self, f: &Id) -> Option<&Id> {
        self.category.get_cod(f)
    }
    fn set_dom(&mut self, f: Id, x: Id) {
        self.category.set_dom(f, x);
    }
    fn set_cod(&mut self, f: Id, x: Id) {
        self.category.set_cod(f, x);
    }
}

impl<Id: Eq + Clone + Hash> Validate for DiscreteDblModel<Id> {
    type ValidationError = InvalidDblModel<Id>;

    fn validate(&self) -> Result<(), nonempty::NonEmpty<Self::ValidationError>> {
        validate::wrap_errors(self.iter_invalid())
    }
}

#[cfg(test)]
mod tests {
    use nonempty::nonempty;
    use ustr::ustr;

    use super::*;
    use crate::stdlib::{models::*, theories::*, theory_morphisms::*};
    use crate::{one::Path, zero::name};

    #[test]
    fn validate() {
        let th = Rc::new(th_schema());
        let mut model = DiscreteDblModel::new(th.clone());
        let entity = ustr("entity");
        model.add_ob(entity, name("NotObType"));
        assert_eq!(model.validate(), Err(nonempty![InvalidDblModel::ObType(entity)]));

        let mut model = DiscreteDblModel::new(th.clone());
        model.add_ob(entity, name("Entity"));
        model.add_mor(ustr("map"), entity, entity, name("NotMorType").into());
        assert_eq!(model.validate(), Err(nonempty![InvalidDblModel::MorType(ustr("map"))]));

        let mut model = DiscreteDblModel::new(th);
        model.add_ob(entity, name("Entity"));
        model.add_ob(ustr("type"), name("AttrType"));
        model.add_mor(ustr("a"), entity, ustr("type"), name("Attr").into());
        assert!(model.validate().is_ok());
        model.add_mor(ustr("b"), entity, ustr("type"), Path::Id(name("Entity")));
        assert_eq!(model.validate(), Err(nonempty![InvalidDblModel::CodType(ustr("b"))]));
    }

    #[test]
    fn infer_missing() {
        let th = Rc::new(th_schema());
        let mut model = DiscreteDblModel::new(th.clone());
        model.add_mor(ustr("attr"), ustr("entity"), ustr("type"), name("Attr").into());
        model.infer_missing();
        assert_eq!(model, walking_attr(th));
    }

    #[test]
    fn pushforward_migrate() {
        let th = Rc::new(th_category());
        let mut model = DiscreteDblModel::new(th);
        let (x, f) = (ustr("x"), ustr("f"));
        model.add_ob(x, name("Object"));
        model.add_mor(f, x, x, Path::Id(name("Object")));

        let functor_data = th_category_to_schema();
        let new_th = Rc::new(th_schema());
        model.push_forward(&functor_data.functor_into(&new_th.0), new_th.clone());
        assert_eq!(model.ob_generator_type(&x), name("Entity"));
        assert_eq!(model.mor_generator_type(&f), Path::Id(name("Entity")));
    }
}
