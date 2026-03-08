//! Models of discrete tabulator theories.

use std::rc::Rc;

use derivative::Derivative;
use derive_more::From;

use super::theory::*;
use crate::dbl::{category::*, model::*, theory::DblTheory};
use crate::tt::util::pretty::*;
use crate::validate::{self, Validate};
use crate::{one::*, zero::*};

/// Object in a model of a discrete tabulator theory.
#[derive(Clone, PartialEq, Eq, From)]
pub enum TabOb {
    /// Basic or generating object.
    #[from]
    Basic(QualifiedName),

    /// A morphism viewed as an object of a tabulator.
    Tabulated(Box<TabMor>),
}

impl TabOb {
    /// Extracts a basic object or nothing.
    pub fn basic(self) -> Option<QualifiedName> {
        match self {
            TabOb::Basic(id) => Some(id),
            _ => None,
        }
    }

    /// Extracts a tabulated morphism or nothing.
    pub fn tabulated(self) -> Option<TabMor> {
        match self {
            TabOb::Tabulated(mor) => Some(*mor),
            _ => None,
        }
    }

    /// Unwraps a basic object, or panics.
    pub fn unwrap_basic(self) -> QualifiedName {
        self.basic().expect("Object should be a basic object")
    }

    /// Unwraps a tabulated morphism, or panics.
    pub fn unwrap_tabulated(self) -> TabMor {
        self.tabulated().expect("Object should be a tabulated morphism")
    }
}

/// "Edge" in a model of a discrete tabulator theory.
///
/// Morphisms of these two forms generate all the morphisms in the model.
#[derive(Clone, PartialEq, Eq, From)]
pub enum TabEdge {
    /// Basic morphism between any two objects.
    #[from]
    Basic(QualifiedName),

    /// Generating morphism between tabulated morphisms, a commutative square.
    Square {
        /// The domain, a tabulated morphism.
        dom: Box<TabMor>,

        /// The codomain, a tabulated morphism.
        cod: Box<TabMor>,

        /// Edge that acts by pre-composition onto codomain.
        pre: Box<TabEdge>,

        /// Edge that acts by post-composition onto domain.
        post: Box<TabEdge>,
    },
}

/// Morphism in a model of a discrete tabulator theory.
pub type TabMor = Path<TabOb, TabEdge>;

impl From<QualifiedName> for TabMor {
    fn from(value: QualifiedName) -> Self {
        Path::single(value.into())
    }
}

#[derive(Clone, Default, PartialEq, Eq)]
struct DiscreteTabGenerators {
    objects: HashFinSet<QualifiedName>,
    morphisms: HashFinSet<QualifiedName>,
    dom: HashColumn<QualifiedName, TabOb>,
    cod: HashColumn<QualifiedName, TabOb>,
}

impl Graph for DiscreteTabGenerators {
    type V = TabOb;
    type E = TabEdge;

    fn has_vertex(&self, ob: &Self::V) -> bool {
        match ob {
            TabOb::Basic(v) => self.objects.contains(v),
            TabOb::Tabulated(p) => (*p).contained_in(self),
        }
    }

    fn has_edge(&self, edge: &Self::E) -> bool {
        match edge {
            TabEdge::Basic(e) => {
                self.morphisms.contains(e) && self.dom.is_set(e) && self.cod.is_set(e)
            }
            TabEdge::Square { dom, cod, pre, post } => {
                if !(dom.contained_in(self) && cod.contained_in(self)) {
                    return false;
                }
                let path1 = dom.clone().concat_in(self, Path::single(*post.clone()));
                let path2 = Path::single(*pre.clone()).concat_in(self, *cod.clone());
                path1.is_some() && path2.is_some() && path1 == path2
            }
        }
    }

    fn src(&self, edge: &Self::E) -> Self::V {
        match edge {
            TabEdge::Basic(e) => {
                self.dom.apply_to_ref(e).expect("Domain of morphism should be defined")
            }
            TabEdge::Square { dom, .. } => TabOb::Tabulated(dom.clone()),
        }
    }

    fn tgt(&self, edge: &Self::E) -> Self::V {
        match edge {
            TabEdge::Basic(e) => {
                self.cod.apply_to_ref(e).expect("Codomain of morphism should be defined")
            }
            TabEdge::Square { cod, .. } => TabOb::Tabulated(cod.clone()),
        }
    }
}

/// A finitely presented model of a discrete tabulator theory.
///
/// A **model** of a [discrete tabulator theory](super::theory::DiscreteTabTheory)
/// is a normal lax functor from the theory into the double category of profunctors
/// that preserves tabulators. For the definition of "preserving tabulators," see
/// the dev docs.
#[derive(Clone, Derivative)]
#[derivative(PartialEq, Eq)]
pub struct DiscreteTabModel {
    #[derivative(PartialEq(compare_with = "Rc::ptr_eq"))]
    theory: Rc<DiscreteTabTheory>,
    generators: DiscreteTabGenerators,
    // TODO: Equations
    ob_types: IndexedHashColumn<QualifiedName, TabObType>,
    mor_types: IndexedHashColumn<QualifiedName, TabMorType>,
}

impl DiscreteTabModel {
    /// Creates an empty model of the given theory.
    pub fn new(theory: Rc<DiscreteTabTheory>) -> Self {
        Self {
            theory,
            generators: Default::default(),
            ob_types: Default::default(),
            mor_types: Default::default(),
        }
    }

    /// Convenience method to turn a morphism into an object.
    pub fn tabulated(&self, mor: TabMor) -> TabOb {
        TabOb::Tabulated(Box::new(mor))
    }

    /// Convenience method to turn a morphism generator into an object.
    pub fn tabulated_gen(&self, f: QualifiedName) -> TabOb {
        self.tabulated(Path::single(TabEdge::Basic(f)))
    }

    /// Iterates over failures of model to be well defined.
    pub fn iter_invalid(&self) -> impl Iterator<Item = InvalidDblModel> + '_ {
        type Invalid = InvalidDblModel;
        let ob_errors = self.generators.objects.iter().filter_map(|x| {
            if self.ob_types.get(&x).is_some_and(|typ| self.theory.has_ob_type(typ)) {
                None
            } else {
                Some(Invalid::ObType(x))
            }
        });
        let mor_errors = self.generators.morphisms.iter().flat_map(|e| {
            let mut errs = Vec::new();
            let dom = self.generators.dom.get(&e).filter(|x| self.has_ob(x));
            let cod = self.generators.cod.get(&e).filter(|x| self.has_ob(x));
            if dom.is_none() {
                errs.push(Invalid::Dom(e.clone()));
            }
            if cod.is_none() {
                errs.push(Invalid::Cod(e.clone()));
            }
            if let Some(mor_type) =
                self.mor_types.get(&e).filter(|typ| self.theory.has_mor_type(typ))
            {
                if dom.is_some_and(|x| self.ob_type(x) != self.theory.src(mor_type)) {
                    errs.push(Invalid::DomType(e.clone()));
                }
                if cod.is_some_and(|x| self.ob_type(x) != self.theory.tgt(mor_type)) {
                    errs.push(Invalid::CodType(e.clone()));
                }
            } else {
                errs.push(Invalid::MorType(e));
            }
            errs.into_iter()
        });
        ob_errors.chain(mor_errors)
    }
}

impl Category for DiscreteTabModel {
    type Ob = TabOb;
    type Mor = TabMor;

    fn has_ob(&self, x: &Self::Ob) -> bool {
        self.generators.has_vertex(x)
    }
    fn has_mor(&self, path: &Self::Mor) -> bool {
        path.contained_in(&self.generators)
    }
    fn dom(&self, path: &Self::Mor) -> Self::Ob {
        path.src(&self.generators)
    }
    fn cod(&self, path: &Self::Mor) -> Self::Ob {
        path.tgt(&self.generators)
    }

    fn compose(&self, path: Path<Self::Ob, Self::Mor>) -> Self::Mor {
        path.flatten_in(&self.generators).expect("Paths should be composable")
    }
}

impl FgCategory for DiscreteTabModel {
    type ObGen = QualifiedName;
    type MorGen = QualifiedName;

    fn ob_generators(&self) -> impl Iterator<Item = Self::ObGen> {
        self.generators.objects.iter()
    }
    fn mor_generators(&self) -> impl Iterator<Item = Self::MorGen> {
        self.generators.morphisms.iter()
    }

    fn mor_generator_dom(&self, f: &Self::MorGen) -> Self::Ob {
        self.generators.dom.apply_to_ref(f).expect("Domain should be defined")
    }
    fn mor_generator_cod(&self, f: &Self::MorGen) -> Self::Ob {
        self.generators.cod.apply_to_ref(f).expect("Codomain should be defined")
    }
}

impl DblModel for DiscreteTabModel {
    type ObType = TabObType;
    type MorType = TabMorType;
    type ObOp = TabObOp;
    type MorOp = TabMorOp;
    type Theory = DiscreteTabTheory;

    fn theory(&self) -> Rc<Self::Theory> {
        self.theory.clone()
    }

    fn ob_type(&self, ob: &Self::Ob) -> Self::ObType {
        match ob {
            TabOb::Basic(x) => self.ob_generator_type(x),
            TabOb::Tabulated(m) => TabObType::Tabulator(Box::new(self.mor_type(m))),
        }
    }

    fn mor_type(&self, mor: &Self::Mor) -> Self::MorType {
        let types = mor.clone().map(
            |x| self.ob_type(&x),
            |edge| match edge {
                TabEdge::Basic(f) => self.mor_generator_type(&f),
                TabEdge::Square { dom, .. } => {
                    let typ = self.mor_type(&dom); // == self.mor_type(&cod)
                    TabMorType::Hom(Box::new(TabObType::Tabulator(Box::new(typ))))
                }
            },
        );
        self.theory.compose_types(types).expect("Morphism types should have composite")
    }

    fn ob_act(&self, _ob: Self::Ob, _op: &Self::ObOp) -> Self::Ob {
        panic!("Action on objects not implemented")
    }

    fn mor_act(&self, _path: Path<Self::Ob, Self::Mor>, _op: &Self::MorOp) -> Self::Mor {
        panic!("Action on morphisms not implemented")
    }
}

impl FgDblModel for DiscreteTabModel {
    fn ob_generator_type(&self, ob: &Self::ObGen) -> Self::ObType {
        self.ob_types.apply_to_ref(ob).expect("Object should have type")
    }
    fn mor_generator_type(&self, mor: &Self::MorGen) -> Self::MorType {
        self.mor_types.apply_to_ref(mor).expect("Morphism should have type")
    }

    fn ob_generators_with_type(&self, obtype: &Self::ObType) -> impl Iterator<Item = Self::ObGen> {
        self.ob_types.preimage(obtype)
    }
    fn mor_generators_with_type(
        &self,
        mortype: &Self::MorType,
    ) -> impl Iterator<Item = Self::MorGen> {
        self.mor_types.preimage(mortype)
    }
}

impl MutDblModel for DiscreteTabModel {
    fn add_ob(&mut self, x: Self::ObGen, ob_type: Self::ObType) {
        self.ob_types.set(x.clone(), ob_type);
        self.generators.objects.insert(x);
    }

    fn make_mor(&mut self, f: Self::MorGen, mor_type: Self::MorType) {
        self.mor_types.set(f.clone(), mor_type);
        self.generators.morphisms.insert(f);
    }

    fn get_dom(&self, f: &Self::MorGen) -> Option<&Self::Ob> {
        self.generators.dom.get(f)
    }
    fn get_cod(&self, f: &Self::MorGen) -> Option<&Self::Ob> {
        self.generators.cod.get(f)
    }
    fn set_dom(&mut self, f: Self::MorGen, x: Self::Ob) {
        self.generators.dom.set(f, x);
    }
    fn set_cod(&mut self, f: Self::MorGen, x: Self::Ob) {
        self.generators.cod.set(f, x);
    }
}

impl PrintableDblModel for DiscreteTabModel {
    fn ob_to_doc<'a>(&self, ob: &Self::Ob, ob_ns: &Namespace, mor_ns: &Namespace) -> D<'a> {
        match ob {
            TabOb::Basic(name) => t(ob_ns.label_string(name)),
            TabOb::Tabulated(mor) => self.mor_to_doc(mor, ob_ns, mor_ns),
        }
    }

    fn mor_to_doc<'a>(&self, mor: &Self::Mor, ob_ns: &Namespace, mor_ns: &Namespace) -> D<'a> {
        match mor {
            Path::Id(ob) => unop(t("Id"), self.ob_to_doc(ob, ob_ns, mor_ns)),
            Path::Seq(edges) => intersperse(edges.iter().map(|e| edge_to_doc(e, mor_ns)), t(" ⋅ ")),
        }
    }

    fn ob_type_to_doc<'a>(ob_type: &Self::ObType) -> D<'a> {
        ob_type.to_doc()
    }

    fn mor_type_to_doc<'a>(mor_type: &Self::MorType) -> D<'a> {
        mor_type.to_doc()
    }
}

fn edge_to_doc<'a>(edge: &TabEdge, mor_ns: &Namespace) -> D<'a> {
    match edge {
        TabEdge::Basic(name) => t(mor_ns.label_string(name)),
        TabEdge::Square { dom: _, cod: _, pre, post } => {
            tuple([edge_to_doc(pre, mor_ns), edge_to_doc(post, mor_ns)])
        }
    }
}

impl std::fmt::Display for DiscreteTabModel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", DblModelPrinter::new().doc(self).pretty())
    }
}

impl Validate for DiscreteTabModel {
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
    use crate::{
        stdlib::{models::*, theories::*},
        zero::name,
    };

    #[test]
    fn validate() {
        let th = Rc::new(th_category_links());
        let mut model = DiscreteTabModel::new(th);
        model.add_ob(name("x"), name("Object").into());
        model.add_mor(name("f"), name("x").into(), name("x").into(), name("Link").into());
        assert_eq!(model.validate(), Err(nonempty![InvalidDblModel::CodType(name("f"))]));
    }

    #[test]
    fn pretty_print() {
        let model = backward_link(Rc::new(th_category_links()));
        let expected = expect![[r#"
            model generated by 2 objects and 2 morphisms
            x : Object
            y : Object
            f : x -> y : Hom Object
            link : y -> f : Link"#]];
        expected.assert_eq(&format!("{model}"));
    }
}
