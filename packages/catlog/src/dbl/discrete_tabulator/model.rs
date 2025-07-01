//! Models of discrete tabulator theories.

use std::hash::{BuildHasher, BuildHasherDefault, Hash, RandomState};
use std::rc::Rc;

use derivative::Derivative;
use ustr::{IdentityHasher, Ustr};

use super::theory::*;
use crate::dbl::{category::*, model::*, theory::DblTheory};
use crate::validate::{self, Validate};
use crate::{one::*, zero::*};

/// Object in a model of a discrete tabulator theory.
#[derive(Clone, PartialEq, Eq)]
pub enum TabOb<V, E> {
    /// Basic or generating object.
    Basic(V),

    /// A morphism viewed as an object of a tabulator.
    Tabulated(Box<TabMor<V, E>>),
}

impl<V, E> From<V> for TabOb<V, E> {
    fn from(value: V) -> Self {
        TabOb::Basic(value)
    }
}

impl<V, E> TabOb<V, E> {
    /// Extracts a basic object or nothing.
    pub fn basic(self) -> Option<V> {
        match self {
            TabOb::Basic(v) => Some(v),
            _ => None,
        }
    }

    /// Extracts a tabulated morphism or nothing.
    pub fn tabulated(self) -> Option<TabMor<V, E>> {
        match self {
            TabOb::Tabulated(mor) => Some(*mor),
            _ => None,
        }
    }

    /// Unwraps a basic object, or panics.
    pub fn unwrap_basic(self) -> V {
        self.basic().expect("Object should be a basic object")
    }

    /// Unwraps a tabulated morphism, or panics.
    pub fn unwrap_tabulated(self) -> TabMor<V, E> {
        self.tabulated().expect("Object should be a tabulated morphism")
    }
}

/** "Edge" in a model of a discrete tabulator theory.

Morphisms of these two forms generate all the morphisms in the model.
 */
#[derive(Clone, PartialEq, Eq)]
pub enum TabEdge<V, E> {
    /// Basic morphism between any two objects.
    Basic(E),

    /// Generating morphism between tabulated morphisms, a commutative square.
    Square {
        /// The domain, a tabulated morphism.
        dom: Box<TabMor<V, E>>,

        /// The codomain, a tabulated morphism.
        cod: Box<TabMor<V, E>>,

        /// Edge that acts by pre-composition onto codomain.
        pre: Box<TabEdge<V, E>>,

        /// Edge that acts by post-composition onto domain.
        post: Box<TabEdge<V, E>>,
    },
}

impl<V, E> From<E> for TabEdge<V, E> {
    fn from(value: E) -> Self {
        TabEdge::Basic(value)
    }
}

/// Morphism in a model of a discrete tabulator theory.
pub type TabMor<V, E> = Path<TabOb<V, E>, TabEdge<V, E>>;

impl<V, E> From<E> for TabMor<V, E> {
    fn from(value: E) -> Self {
        Path::single(value.into())
    }
}

#[derive(Clone, Derivative)]
#[derivative(Default(bound = ""))]
#[derivative(PartialEq(bound = "V: Eq + Hash, E: Eq + Hash"))]
#[derivative(Eq(bound = "V: Eq + Hash, E: Eq + Hash"))]
struct DiscreteTabGenerators<V, E> {
    objects: HashFinSet<V>,
    morphisms: HashFinSet<E>,
    dom: HashColumn<E, TabOb<V, E>>,
    cod: HashColumn<E, TabOb<V, E>>,
}

impl<V, E> Graph for DiscreteTabGenerators<V, E>
where
    V: Eq + Clone + Hash,
    E: Eq + Clone + Hash,
{
    type V = TabOb<V, E>;
    type E = TabEdge<V, E>;

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
            TabEdge::Square {
                dom,
                cod,
                pre,
                post,
            } => {
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

/** A finitely presented model of a discrete tabulator theory.

A **model** of a [discrete tabulator theory](super::theory::DiscreteTabTheory)
is a normal lax functor from the theory into the double category of profunctors
that preserves tabulators. For the definition of "preserving tabulators," see
the dev docs.
 */
#[derive(Clone, Derivative)]
#[derivative(PartialEq(bound = "Id: Eq + Hash, ThId: Eq + Hash"))]
#[derivative(Eq(bound = "Id: Eq + Hash, ThId: Eq + Hash"))]
pub struct DiscreteTabModel<Id, ThId, S = RandomState> {
    #[derivative(PartialEq(compare_with = "Rc::ptr_eq"))]
    theory: Rc<DiscreteTabTheory<ThId, ThId, S>>,
    generators: DiscreteTabGenerators<Id, Id>,
    // TODO: Equations
    ob_types: IndexedHashColumn<Id, TabObType<ThId, ThId>>,
    mor_types: IndexedHashColumn<Id, TabMorType<ThId, ThId>>,
}

/// A model of a discrete tabulator theory where both theory and model have keys
/// of type `Ustr`.
pub type UstrDiscreteTabModel = DiscreteTabModel<Ustr, Ustr, BuildHasherDefault<IdentityHasher>>;

impl<Id, ThId, S> DiscreteTabModel<Id, ThId, S>
where
    Id: Eq + Clone + Hash,
    ThId: Eq + Clone + Hash,
    S: BuildHasher,
{
    /// Creates an empty model of the given theory.
    pub fn new(theory: Rc<DiscreteTabTheory<ThId, ThId, S>>) -> Self {
        Self {
            theory,
            generators: Default::default(),
            ob_types: Default::default(),
            mor_types: Default::default(),
        }
    }

    /// Convenience method to turn a morphism into an object.
    pub fn tabulated(&self, mor: TabMor<Id, Id>) -> TabOb<Id, Id> {
        TabOb::Tabulated(Box::new(mor))
    }

    /// Convenience method to turn a morphism generator into an object.
    pub fn tabulated_gen(&self, f: Id) -> TabOb<Id, Id> {
        self.tabulated(Path::single(TabEdge::Basic(f)))
    }

    /// Iterates over failures of model to be well defined.
    pub fn iter_invalid(&self) -> impl Iterator<Item = InvalidDblModel<Id>> + '_ {
        type Invalid<Id> = InvalidDblModel<Id>;
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

impl<Id, ThId, S> Category for DiscreteTabModel<Id, ThId, S>
where
    Id: Eq + Clone + Hash,
{
    type Ob = TabOb<Id, Id>;
    type Mor = TabMor<Id, Id>;

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

impl<Id, ThId, S> FgCategory for DiscreteTabModel<Id, ThId, S>
where
    Id: Eq + Clone + Hash,
{
    type ObGen = Id;
    type MorGen = Id;

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

impl<Id, ThId, S> DblModel for DiscreteTabModel<Id, ThId, S>
where
    Id: Eq + Clone + Hash,
    ThId: Eq + Clone + Hash,
    S: BuildHasher,
{
    type ObType = TabObType<ThId, ThId>;
    type MorType = TabMorType<ThId, ThId>;
    type ObOp = TabObOp<ThId, ThId>;
    type MorOp = TabMorOp<ThId, ThId>;
    type Theory = DiscreteTabTheory<ThId, ThId, S>;

    fn theory(&self) -> &Self::Theory {
        &self.theory
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

    fn mor_act(&self, _mor: Self::Mor, _op: &Self::MorOp) -> Self::Mor {
        panic!("Action on morphisms not implemented")
    }
}

impl<Id, ThId, S> FgDblModel for DiscreteTabModel<Id, ThId, S>
where
    Id: Eq + Clone + Hash,
    ThId: Eq + Clone + Hash,
    S: BuildHasher,
{
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

impl<Id, ThId, S> MutDblModel for DiscreteTabModel<Id, ThId, S>
where
    Id: Eq + Clone + Hash,
    ThId: Eq + Clone + Hash,
    S: BuildHasher,
{
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

impl<Id, ThId, S> Validate for DiscreteTabModel<Id, ThId, S>
where
    Id: Eq + Clone + Hash,
    ThId: Eq + Clone + Hash,
    S: BuildHasher,
{
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
    use crate::stdlib::theories::*;

    #[test]
    fn validate() {
        let th = Rc::new(th_category_links());
        let mut model = DiscreteTabModel::new(th);
        let (x, f) = (ustr("x"), ustr("f"));
        model.add_ob(x, TabObType::Basic(ustr("Object")));
        model.add_mor(f, TabOb::Basic(x), TabOb::Basic(x), TabMorType::Basic(ustr("Link")));
        assert_eq!(model.validate(), Err(nonempty![InvalidDblModel::CodType(f)]));
    }
}
