//! Models of discrete double theories.

use std::rc::Rc;

use derivative::Derivative;

use super::theory::DiscreteDblTheory;
use crate::dbl::{category::*, model::*, theory::DblTheory};
use crate::one::{fp_category::QualifiedFpCategory, *};
use crate::tt::util::pretty::*;
use crate::validate::{self, Validate};
use crate::zero::*;

/// A finitely presented model of a discrete double theory.
///
/// Since discrete double theory has only identity operations, such a model is a
/// finite presentation of a category sliced over the object and morphism types
/// comprising the theory. A type theorist would call it a ["displayed
/// category"](https://ncatlab.org/nlab/show/displayed+category).
#[derive(Clone, Debug, Derivative)]
#[derivative(PartialEq, Eq)]
pub struct DiscreteDblModel {
    #[derivative(PartialEq(compare_with = "Rc::ptr_eq"))]
    theory: Rc<DiscreteDblTheory>,
    pub(crate) category: QualifiedFpCategory,
    ob_types: IndexedHashColumn<QualifiedName, QualifiedName>,
    mor_types: IndexedHashColumn<QualifiedName, QualifiedPath>,
}

impl DiscreteDblModel {
    /// Creates an empty model of the given theory.
    pub fn new(theory: Rc<DiscreteDblTheory>) -> Self {
        Self {
            theory,
            category: Default::default(),
            ob_types: Default::default(),
            mor_types: Default::default(),
        }
    }

    /// Returns the underlying graph of the model.
    pub fn generating_graph(&self) -> &impl FinGraph<V = QualifiedName, E = QualifiedName> {
        self.category.generators()
    }

    /// Is the model freely generated?
    pub fn is_free(&self) -> bool {
        self.category.is_free()
    }

    /// Adds a path equation to the model.
    pub fn add_equation(&mut self, eq: PathEq<QualifiedName, QualifiedName>) {
        self.category.add_equation(eq);
    }

    /// Iterates over failures of model to be well defined.
    pub fn iter_invalid(&self) -> impl Iterator<Item = InvalidDblModel> + '_ {
        type Invalid = InvalidDblModel;
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

    /// Infer missing data in the model, where possible.
    ///
    /// Objects used in the domain or codomain of morphisms, but not contained as
    /// objects of the model, are added and their types are inferred. It is not
    /// always possible to do this consistently, so it is important to `validate`
    /// the model even after calling this method.
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

impl Category for DiscreteDblModel {
    type Ob = QualifiedName;
    type Mor = QualifiedPath;

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

impl FgCategory for DiscreteDblModel {
    type ObGen = QualifiedName;
    type MorGen = QualifiedName;

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

impl DblModel for DiscreteDblModel {
    type ObType = QualifiedName;
    type MorType = QualifiedPath;
    type ObOp = QualifiedName;
    type MorOp = Path<QualifiedName, QualifiedPath>;
    type Theory = DiscreteDblTheory;

    fn theory(&self) -> Rc<Self::Theory> {
        self.theory.clone()
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

impl FgDblModel for DiscreteDblModel {
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

impl MutDblModel for DiscreteDblModel {
    fn add_ob(&mut self, x: Self::ObGen, ob_type: Self::ObType) {
        self.ob_types.set(x.clone(), ob_type);
        self.category.add_ob_generator(x);
    }

    fn add_mor(&mut self, f: Self::MorGen, dom: Self::Ob, cod: Self::Ob, mor_type: Self::MorType) {
        self.mor_types.set(f.clone(), mor_type);
        self.category.add_mor_generator(f, dom, cod);
    }

    fn make_mor(&mut self, f: Self::MorGen, mor_type: Self::MorType) {
        self.mor_types.set(f.clone(), mor_type);
        self.category.make_mor_generator(f);
    }

    fn get_dom(&self, f: &Self::MorGen) -> Option<&Self::Ob> {
        self.category.get_dom(f)
    }
    fn get_cod(&self, f: &Self::MorGen) -> Option<&Self::Ob> {
        self.category.get_cod(f)
    }
    fn set_dom(&mut self, f: Self::MorGen, x: Self::Ob) {
        self.category.set_dom(f, x);
    }
    fn set_cod(&mut self, f: Self::MorGen, x: Self::Ob) {
        self.category.set_cod(f, x);
    }
}

impl PrintableDblModel for DiscreteDblModel {
    fn ob_to_doc<'a>(&self, ob: &Self::Ob, ob_ns: &Namespace, _mor_ns: &Namespace) -> D<'a> {
        t(ob_ns.label_string(ob))
    }

    fn mor_to_doc<'a>(&self, mor: &Self::Mor, ob_ns: &Namespace, mor_ns: &Namespace) -> D<'a> {
        match mor {
            Path::Id(ob) => unop("Id", self.ob_to_doc(ob, ob_ns, mor_ns)),
            Path::Seq(seq) => intersperse(seq.iter().map(|f| t(mor_ns.label_string(f))), t(" ⋅ ")),
        }
    }

    fn ob_type_to_doc<'a>(ob_type: &Self::ObType) -> D<'a> {
        ob_type.to_doc()
    }

    fn mor_type_to_doc<'a>(mor_type: &Self::MorType) -> D<'a> {
        match mor_type {
            Path::Id(ob_type) => unop("Hom", Self::ob_type_to_doc(ob_type)),
            Path::Seq(seq) => intersperse(seq.iter().map(|m| m.to_doc()), t(" ⊙ ")),
        }
    }
}

impl std::fmt::Display for DiscreteDblModel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", DblModelPrinter::new().doc(self).pretty())
    }
}

impl Validate for DiscreteDblModel {
    type ValidationError = InvalidDblModel;

    fn validate(&self) -> Result<(), nonempty::NonEmpty<Self::ValidationError>> {
        validate::wrap_errors(self.iter_invalid())
    }
}

#[cfg(test)]
mod tests {
    use expect_test::expect;
    use nonempty::nonempty;

    use super::*;
    use crate::stdlib::{models::*, theories::*, theory_morphisms::*};
    use crate::{one::Path, zero::name};

    #[test]
    fn validate() {
        let th = Rc::new(th_schema());
        let mut model = DiscreteDblModel::new(th.clone());
        model.add_ob(name("entity"), name("NotObType"));
        assert_eq!(model.validate(), Err(nonempty![InvalidDblModel::ObType(name("entity"))]));

        let mut model = DiscreteDblModel::new(th.clone());
        model.add_ob(name("entity"), name("Entity"));
        model.add_mor(name("map"), name("entity"), name("entity"), name("NotMorType").into());
        assert_eq!(model.validate(), Err(nonempty![InvalidDblModel::MorType(name("map"))]));

        let mut model = DiscreteDblModel::new(th);
        model.add_ob(name("entity"), name("Entity"));
        model.add_ob(name("type"), name("AttrType"));
        model.add_mor(name("a"), name("entity"), name("type"), name("Attr").into());
        assert!(model.validate().is_ok());
        model.add_mor(name("b"), name("entity"), name("type"), Path::Id(name("Entity")));
        assert_eq!(model.validate(), Err(nonempty![InvalidDblModel::CodType(name("b"))]));
    }

    #[test]
    fn pretty_print() {
        let model = walking_attr(Rc::new(th_schema()));
        let expected = expect![[r#"
            model generated by 2 objects and 1 morphism
            entity : Entity
            type : AttrType
            attr : entity -> type : Attr"#]];
        expected.assert_eq(&format!("{model}"));
    }

    #[test]
    fn infer_missing() {
        let th = Rc::new(th_schema());
        let mut model = DiscreteDblModel::new(th.clone());
        model.add_mor(name("attr"), name("entity"), name("type"), name("Attr").into());
        model.infer_missing();
        assert_eq!(model, walking_attr(th));
    }

    #[test]
    fn pushforward_migrate() {
        let th = Rc::new(th_category());
        let mut model = DiscreteDblModel::new(th);
        model.add_ob(name("x"), name("Object"));
        model.add_mor(name("f"), name("x"), name("x"), Path::Id(name("Object")));

        let functor_data = th_category_to_schema();
        let new_th = Rc::new(th_schema());
        model.push_forward(&functor_data.functor_into(&new_th.0), new_th.clone());
        assert_eq!(model.ob_generator_type(&name("x")), name("Entity"));
        assert_eq!(model.mor_generator_type(&name("f")), Path::Id(name("Entity")));
    }
}
