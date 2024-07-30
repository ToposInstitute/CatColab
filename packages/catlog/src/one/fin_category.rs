//! Data structures for finite and finitely presented categories.

use std::hash::{BuildHasher, BuildHasherDefault, Hash, RandomState};

use derivative::Derivative;
use nonempty::NonEmpty;
use thiserror::Error;
use ustr::{IdentityHasher, Ustr};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify_next::Tsify;

use super::category::*;
use super::graph::*;
use super::path::*;
use crate::validate::{self, Validate};
use crate::zero::{Column, HashColumn, Mapping};

/// Morphism in a finite category.
#[derive(Clone, Debug, Copy, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(tag = "tag", content = "content"))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub enum FinHom<V, E> {
    /// Identity morphism on an object.
    Id(V),

    /// Generating morphism of the finite category.
    Generator(E),
}

/** A finite category with explicitly defined composition law.

Such a category is not just finitely presented, but actually finite. The
composition law is defined by a hash map on pairs of morphism generators. While
very special, finite categories show up surprisingly often as schemas or
theories. For example, the schemas for graphs, symmetric graphs, reflexive
graphs, and symmetric reflexive graphs are all finite.
 */
#[derive(Clone, Derivative)]
#[derivative(Default(bound = "S: Default"))]
pub struct FinCategory<V, E, S = RandomState> {
    generators: HashGraph<V, E, S>,
    compose_map: HashColumn<(E, E), FinHom<V, E>>,
}

/// A finite category with objects and morphisms of type `Ustr`.
pub type UstrFinCategory = FinCategory<Ustr, Ustr, BuildHasherDefault<IdentityHasher>>;

impl<V, E, S> FinCategory<V, E, S>
where
    V: Eq + Hash + Clone,
    E: Eq + Hash + Clone,
    S: BuildHasher,
{
    /// Adds an object generator, returning whether it is new.
    pub fn add_ob_generator(&mut self, v: V) -> bool {
        self.generators.add_vertex(v)
    }

    /// Adds multiple object generators.
    pub fn add_ob_generators<T>(&mut self, iter: T)
    where
        T: IntoIterator<Item = V>,
    {
        self.generators.add_vertices(iter)
    }

    /// Adds a morphism generator, returning whether it is new.
    pub fn add_hom_generator(&mut self, e: E, dom: V, cod: V) -> bool {
        self.generators.add_edge(e, dom, cod)
    }

    /// Sets the value of a binary composite.
    pub fn set_composite(&mut self, d: E, e: E, f: FinHom<V, E>) {
        self.compose_map.set((d, e), f);
    }
}

impl<V, E, S> Category for FinCategory<V, E, S>
where
    V: Eq + Hash + Clone,
    E: Eq + Hash + Clone,
    S: BuildHasher,
{
    type Ob = V;
    type Hom = FinHom<V, E>;

    fn has_ob(&self, x: &V) -> bool {
        self.generators.has_vertex(x)
    }

    fn has_hom(&self, f: &FinHom<V, E>) -> bool {
        match f {
            FinHom::Id(v) => self.generators.has_vertex(v),
            FinHom::Generator(e) => self.generators.has_edge(e),
        }
    }

    fn dom(&self, f: &FinHom<V, E>) -> V {
        match f {
            FinHom::Id(v) => v.clone(),
            FinHom::Generator(e) => self.generators.src(e),
        }
    }

    fn cod(&self, f: &FinHom<V, E>) -> V {
        match f {
            FinHom::Id(v) => v.clone(),
            FinHom::Generator(e) => self.generators.tgt(e),
        }
    }

    fn compose(&self, path: Path<V, FinHom<V, E>>) -> FinHom<V, E> {
        path.reduce(|x| self.id(x), |f, g| self.compose2(f, g))
    }

    fn compose2(&self, f: FinHom<V, E>, g: FinHom<V, E>) -> FinHom<V, E> {
        match (f, g) {
            (FinHom::Id(_), g) => g,
            (f, FinHom::Id(_)) => f,
            (FinHom::Generator(d), FinHom::Generator(e)) => {
                assert!(
                    self.generators.tgt(&d) == self.generators.src(&e),
                    "(Co)domains should be equal"
                );
                self.compose_map.apply(&(d, e)).expect("Composition should be defined").clone()
            }
        }
    }

    fn id(&self, x: V) -> FinHom<V, E> {
        FinHom::Id(x)
    }
}

impl<V, E, S> FgCategory for FinCategory<V, E, S>
where
    V: Eq + Hash + Clone,
    E: Eq + Hash + Clone,
    S: BuildHasher,
{
    fn has_ob_generator(&self, x: &V) -> bool {
        self.generators.has_vertex(x)
    }
    fn has_hom_generator(&self, f: &FinHom<V, E>) -> bool {
        match f {
            FinHom::Id(_) => false,
            FinHom::Generator(e) => self.generators.has_edge(e),
        }
    }
    fn ob_generators(&self) -> impl Iterator<Item = V> {
        self.generators.vertices()
    }
    fn hom_generators(&self) -> impl Iterator<Item = FinHom<V, E>> {
        self.generators.edges().map(FinHom::Generator)
    }
    fn generators_with_dom(&self, x: &V) -> impl Iterator<Item = FinHom<V, E>> {
        self.generators.out_edges(x).map(FinHom::Generator)
    }
    fn generators_with_cod(&self, x: &V) -> impl Iterator<Item = FinHom<V, E>> {
        self.generators.in_edges(x).map(FinHom::Generator)
    }
}

/** A finitely presented category.

Such a presentation is defined by a finite graph together with a set of path
equations. A morphism in the presented category is an *equivalence class* of
paths in the graph, so strictly speaking we work with morphism representatives
rather than morphism themselves.

Like the object and morphism generators, the equations are identified by keys.
Depending on the application, these could be meaningful names for the axioms or
meaningless unique identifiers.
 */
#[derive(Clone, Derivative)]
#[derivative(Default(bound = ""))]
pub struct FpCategory<V, E, EqKey> {
    generators: HashGraph<V, E>,
    equations: HashColumn<EqKey, PathEq<V, E>>,
}

impl<V, E, EqKey> FpCategory<V, E, EqKey>
where
    V: Eq + Clone + Hash,
    E: Eq + Clone + Hash,
    EqKey: Eq + Clone + Hash,
{
    /// Adds an object generator, returning whether it is new.
    pub fn add_ob_generator(&mut self, v: V) -> bool {
        self.generators.add_vertex(v)
    }

    /// Adds multiple object generators.
    pub fn add_ob_generators<Iter>(&mut self, iter: Iter)
    where
        Iter: IntoIterator<Item = V>,
    {
        self.generators.add_vertices(iter)
    }

    /// Adds a morphism generator, returning whether it is new.
    pub fn add_hom_generator(&mut self, e: E, dom: V, cod: V) -> bool {
        self.generators.add_edge(e, dom, cod)
    }

    /// Adds a morphism generator without initializing its (co)domain.
    pub fn make_hom_generator(&mut self, e: E) -> bool {
        self.generators.make_edge(e)
    }

    /// Gets the domain of a morphism generator.
    pub fn get_dom(&self, e: &E) -> Option<&V> {
        self.generators.get_src(e)
    }

    /// Gets the codomain of a morphism generator.
    pub fn get_cod(&self, e: &E) -> Option<&V> {
        self.generators.get_tgt(e)
    }

    /// Sets the domain of a morphism generator.
    pub fn set_dom(&mut self, e: E, v: V) -> Option<V> {
        self.generators.set_src(e, v)
    }

    /// Sets the codomain of a morphism generator.
    pub fn set_cod(&mut self, e: E, v: V) -> Option<V> {
        self.generators.set_tgt(e, v)
    }

    /// Updates the domain of a morphism generator, setting or unsetting it.
    pub fn update_dom(&mut self, e: E, v: Option<V>) -> Option<V> {
        self.generators.update_src(e, v)
    }

    /// Updates the codomain of a morphism generator, setting or unsetting it.
    pub fn update_cod(&mut self, e: E, v: Option<V>) -> Option<V> {
        self.generators.update_tgt(e, v)
    }

    /// Get path equation by key.
    pub fn get_equation(&self, key: &EqKey) -> Option<&PathEq<V, E>> {
        self.equations.apply(key)
    }

    /// Iterates over path equations in the presentation.
    pub fn equations(&self) -> impl Iterator<Item = &PathEq<V, E>> {
        self.equations.values()
    }

    /// Adds a path equation to the presentation.
    pub fn add_equation(&mut self, key: EqKey, eq: PathEq<V, E>) {
        self.equations.set(key, eq);
    }

    /// Iterates over failures to be well-defined presentation of a category.
    pub fn iter_invalid(&self) -> impl Iterator<Item = InvalidFpCategory<E, EqKey>> + '_ {
        let generator_errors = self.generators.iter_invalid().map(|err| match err {
            InvalidGraphData::Src(e) => InvalidFpCategory::Dom(e),
            InvalidGraphData::Tgt(e) => InvalidFpCategory::Cod(e),
        });
        let equation_errors = self.equations.iter().flat_map(|(key, eq)| {
            eq.iter_invalid_in(&self.generators).map(move |err| match err {
                InvalidPathEq::Lhs() => InvalidFpCategory::EqLhs(key.clone()),
                InvalidPathEq::Rhs() => InvalidFpCategory::EqRhs(key.clone()),
                InvalidPathEq::Src() => InvalidFpCategory::EqSrc(key.clone()),
                InvalidPathEq::Tgt() => InvalidFpCategory::EqTgt(key.clone()),
            })
        });
        generator_errors.chain(equation_errors)
    }
}

impl<V, E, EqKey> Validate for FpCategory<V, E, EqKey>
where
    V: Eq + Clone + Hash,
    E: Eq + Clone + Hash,
    EqKey: Eq + Clone + Hash,
{
    type ValidationError = InvalidFpCategory<E, EqKey>;

    fn validate(&self) -> Result<(), NonEmpty<Self::ValidationError>> {
        validate::wrap_errors(self.iter_invalid())
    }
}

impl<V, E, EqKey> Category for FpCategory<V, E, EqKey>
where
    V: Eq + Clone + Hash,
    E: Eq + Clone + Hash,
    EqKey: Eq + Clone + Hash,
{
    type Ob = V;
    type Hom = Path<V, E>;

    fn has_ob(&self, x: &V) -> bool {
        self.generators.has_vertex(x)
    }
    fn has_hom(&self, path: &Path<V, E>) -> bool {
        path.contained_in(&self.generators)
    }
    fn dom(&self, path: &Path<V, E>) -> V {
        path.src(&self.generators)
    }
    fn cod(&self, path: &Path<V, E>) -> V {
        path.tgt(&self.generators)
    }

    fn compose(&self, path: Path<V, Path<V, E>>) -> Path<V, E> {
        path.flatten()
    }
}

impl<V, E, EqKey> FgCategory for FpCategory<V, E, EqKey>
where
    V: Eq + Clone + Hash,
    E: Eq + Clone + Hash,
    EqKey: Eq + Clone + Hash,
{
    fn has_ob_generator(&self, x: &V) -> bool {
        self.generators.has_vertex(x)
    }
    fn has_hom_generator(&self, path: &Path<V, E>) -> bool {
        match path {
            Path::Id(_) => false,
            Path::Seq(es) => es.len() == 1 && self.generators.has_edge(es.first()),
        }
    }
    fn ob_generators(&self) -> impl Iterator<Item = Self::Ob> {
        self.generators.vertices()
    }
    fn hom_generators(&self) -> impl Iterator<Item = Self::Hom> {
        self.generators.edges().map(Path::single)
    }
    fn generators_with_dom(&self, x: &V) -> impl Iterator<Item = Self::Hom> {
        self.generators.out_edges(x).map(Path::single)
    }
    fn generators_with_cod(&self, x: &V) -> impl Iterator<Item = Self::Hom> {
        self.generators.in_edges(x).map(Path::single)
    }
}

/// An invalid generator or equation in a finitely presented category.
#[derive(Debug, Error)]
pub enum InvalidFpCategory<E, EqKey> {
    /// Morphism generator assigned a domain not contained in the category.
    #[error("Domain of morphism generator `{0}` is not in the category")]
    Dom(E),

    /// Morphism generator assigned a codomain not contained in the category.
    #[error("Codomain of morphism generator `{0}` is not in the category")]
    Cod(E),

    /// Path in left hand side of equation not contained in the category.
    #[error("LHS of path equation `{0}` is not in the category")]
    EqLhs(EqKey),

    /// Path in right hand side of equation not contained in the category.
    #[error("RHS of path equation `{0}` is not in the category")]
    EqRhs(EqKey),

    /// Sources of left and right hand sides of path equation are not equal.
    #[error("Path equation `{0}` has sources that are not equal")]
    EqSrc(EqKey),

    /// Targets of left and right hand sides of path equation are not equal.
    #[error("Path equation `{0}` has targets that are not equal")]
    EqTgt(EqKey),
}

#[cfg(test)]
mod tests {
    use super::*;
    use nonempty::nonempty;

    #[test]
    fn fin_category() {
        type Hom<V, E> = FinHom<V, E>;

        let mut sch_sgraph: FinCategory<char, char> = Default::default();
        sch_sgraph.add_ob_generators(['V', 'E']);
        sch_sgraph.add_hom_generator('s', 'E', 'V');
        sch_sgraph.add_hom_generator('t', 'E', 'V');
        sch_sgraph.add_hom_generator('i', 'E', 'E');
        assert_eq!(sch_sgraph.ob_generators().count(), 2);
        assert_eq!(sch_sgraph.hom_generators().count(), 3);
        assert_eq!(sch_sgraph.dom(&Hom::Generator('t')), 'E');
        assert_eq!(sch_sgraph.cod(&Hom::Generator('t')), 'V');

        sch_sgraph.set_composite('i', 'i', Hom::Id('E'));
        sch_sgraph.set_composite('i', 's', Hom::Generator('t'));
        sch_sgraph.set_composite('i', 't', Hom::Generator('s'));
        assert_eq!(sch_sgraph.compose2(Hom::Generator('i'), Hom::Generator('i')), Hom::Id('E'));
        let path = Path::Seq(nonempty![
            Hom::Generator('i'),
            Hom::Id('E'),
            Hom::Generator('i'),
            Hom::Generator('i'),
            Hom::Generator('s'),
        ]);
        assert_eq!(sch_sgraph.compose(path), Hom::Generator('t'));
    }

    #[test]
    fn fp_category() {
        let mut sch_sgraph: FpCategory<_, _, _> = Default::default();
        sch_sgraph.add_ob_generators(['V', 'E']);
        sch_sgraph.add_hom_generator('s', 'E', 'V');
        sch_sgraph.add_hom_generator('t', 'E', 'V');
        sch_sgraph.add_hom_generator('i', 'E', 'E');
        assert_eq!(sch_sgraph.ob_generators().count(), 2);
        assert_eq!(sch_sgraph.hom_generators().count(), 3);
        assert_eq!(sch_sgraph.dom(&Path::single('t')), 'E');
        assert_eq!(sch_sgraph.cod(&Path::single('t')), 'V');
        assert!(sch_sgraph.validate().is_ok());

        sch_sgraph.add_equation("inv", PathEq::new(Path::pair('i', 'i'), Path::empty('E')));
        sch_sgraph.add_equation("rev_src", PathEq::new(Path::pair('i', 's'), Path::single('t')));
        sch_sgraph.add_equation("rev_tgt", PathEq::new(Path::pair('i', 't'), Path::single('s')));
        assert_eq!(sch_sgraph.equations().count(), 3);
        assert!(sch_sgraph.validate().is_ok());

        let mut sch_bad: FpCategory<_, _, _> = Default::default();
        sch_bad.add_ob_generators(['x', 'y']);
        sch_bad.make_hom_generator('f');
        assert_eq!(sch_bad.validate().unwrap_err().len(), 2);
        sch_bad.set_dom('f', 'x');
        sch_bad.set_cod('f', 'y');
        assert!(sch_bad.validate().is_ok());
        sch_bad.add_hom_generator('g', 'y', 'x');
        sch_bad.add_equation('α', PathEq::new(Path::single('f'), Path::single('g')));
        assert_eq!(sch_bad.validate().unwrap_err().len(), 2);
    }
}
