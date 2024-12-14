//! Data structures for finite and finitely presented categories.

use std::hash::{BuildHasher, BuildHasherDefault, Hash, RandomState};

use derivative::Derivative;
use nonempty::NonEmpty;
use thiserror::Error;
use ustr::{IdentityHasher, Ustr};

use super::category::*;
use super::graph::*;
use super::path::*;
use crate::validate::{self, Validate};
use crate::zero::{Column, HashColumn, Mapping};

/// Morphism in a finite category.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum FinMor<V, E> {
    /// Identity morphism on an object.
    Id(V),

    /// Generating morphism of the finite category.
    Generator(E),
}

impl<V, E> From<E> for FinMor<V, E> {
    fn from(value: E) -> Self {
        FinMor::Generator(value)
    }
}

/** A finite category with explicitly defined composition law.

Such a category is not just finitely presented, but actually finite. The
composition law is defined by a hash map on pairs of morphism generators. While
very special, finite categories show up surprisingly often as schemas or
theories. For example, the schemas for graphs, symmetric graphs, reflexive
graphs, and symmetric reflexive graphs are all finite.
 */
#[derive(Clone, Derivative, Debug)]
#[derivative(Default(bound = "S: Default"))]
#[derivative(PartialEq(bound = "V: Eq + Hash, E: Eq + Hash, S: BuildHasher"))]
#[derivative(Eq(bound = "V: Eq + Hash, E: Eq + Hash, S: BuildHasher"))]
pub struct FinCategory<V, E, S = RandomState> {
    generators: HashGraph<V, E, S>,
    compose_map: HashColumn<(E, E), FinMor<V, E>>,
}

/// A finite category with objects and morphisms of type `Ustr`.
pub type UstrFinCategory = FinCategory<Ustr, Ustr, BuildHasherDefault<IdentityHasher>>;

impl<V, E, S> FinCategory<V, E, S>
where
    V: Eq + Hash + Clone,
    E: Eq + Hash + Clone,
    S: BuildHasher,
{
    /// Graph of generators of the finite category.
    pub fn generators(&self) -> &impl FinGraph<V = V, E = E> {
        &self.generators
    }

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
    pub fn add_mor_generator(&mut self, e: E, dom: V, cod: V) -> bool {
        self.generators.add_edge(e, dom, cod)
    }

    /// Sets the value of a binary composite.
    pub fn set_composite(&mut self, d: E, e: E, f: FinMor<V, E>) {
        self.compose_map.set((d, e), f);
    }

    /// Iterates over failures to be a well-defined finite category.
    pub fn iter_invalid(&self) -> impl Iterator<Item = InvalidFinCategory<E>> + '_ {
        let generator_errors = self.generators.iter_invalid().map(|err| match err {
            InvalidGraphData::Src(e) => InvalidFinCategory::Dom(e),
            InvalidGraphData::Tgt(e) => InvalidFinCategory::Cod(e),
        });
        let compose_errors = self.generators.edges().flat_map(move |e1| {
            self.generators.edges().flat_map(move |e2| {
                let mut errs = Vec::new();
                if self.generators.tgt(&e1) != self.generators.src(&e2) {
                    return errs;
                }
                let pair = (e1.clone(), e2.clone());
                if let Some(composite) = self.compose_map.apply(&pair) {
                    if self.dom(composite) != self.generators.src(&e1) {
                        errs.push(InvalidFinCategory::CompositeDom(e1.clone(), e2.clone()));
                    }
                    if self.cod(composite) != self.generators.tgt(&e2) {
                        errs.push(InvalidFinCategory::CompositeCod(pair.0, pair.1));
                    }
                } else {
                    errs.push(InvalidFinCategory::Composite(pair.0, pair.1));
                }
                errs
            })
        });
        generator_errors.chain(compose_errors)
    }
}

impl<V, E, S> Validate for FinCategory<V, E, S>
where
    V: Eq + Hash + Clone,
    E: Eq + Hash + Clone,
    S: BuildHasher,
{
    type ValidationError = InvalidFinCategory<E>;

    fn validate(&self) -> Result<(), NonEmpty<Self::ValidationError>> {
        validate::wrap_errors(self.iter_invalid())
    }
}

impl<V, E, S> Category for FinCategory<V, E, S>
where
    V: Eq + Hash + Clone,
    E: Eq + Hash + Clone,
    S: BuildHasher,
{
    type Ob = V;
    type Mor = FinMor<V, E>;

    fn has_ob(&self, x: &V) -> bool {
        self.generators.has_vertex(x)
    }

    fn has_mor(&self, f: &FinMor<V, E>) -> bool {
        match f {
            FinMor::Id(v) => self.generators.has_vertex(v),
            FinMor::Generator(e) => self.generators.has_edge(e),
        }
    }

    fn dom(&self, f: &FinMor<V, E>) -> V {
        match f {
            FinMor::Id(v) => v.clone(),
            FinMor::Generator(e) => self.generators.src(e),
        }
    }

    fn cod(&self, f: &FinMor<V, E>) -> V {
        match f {
            FinMor::Id(v) => v.clone(),
            FinMor::Generator(e) => self.generators.tgt(e),
        }
    }

    fn compose(&self, path: Path<V, FinMor<V, E>>) -> FinMor<V, E> {
        path.reduce(|x| self.id(x), |f, g| self.compose2(f, g))
    }

    fn compose2(&self, f: FinMor<V, E>, g: FinMor<V, E>) -> FinMor<V, E> {
        match (f, g) {
            (FinMor::Id(_), g) => g,
            (f, FinMor::Id(_)) => f,
            (FinMor::Generator(d), FinMor::Generator(e)) => {
                assert!(
                    self.generators.tgt(&d) == self.generators.src(&e),
                    "(Co)domains should be equal"
                );
                self.compose_map.apply(&(d, e)).expect("Composition should be defined").clone()
            }
        }
    }

    fn id(&self, x: V) -> FinMor<V, E> {
        FinMor::Id(x)
    }
}

impl<V, E, S> FgCategory for FinCategory<V, E, S>
where
    V: Eq + Hash + Clone,
    E: Eq + Hash + Clone,
    S: BuildHasher,
{
    type ObGen = V;
    type MorGen = E;

    fn object_generators(&self) -> impl Iterator<Item = Self::ObGen> {
        self.generators.vertices()
    }

    fn morphism_generators(&self) -> impl Iterator<Item = Self::MorGen> {
        self.generators.edges()
    }

    fn morphism_generator_dom(&self, f: &Self::MorGen) -> Self::Ob {
        self.generators.src(f)
    }

    fn morphism_generator_cod(&self, f: &Self::MorGen) -> Self::Ob {
        self.generators.tgt(f)
    }
}

/// A failure of a finite category to be well defined.
#[derive(Debug, Error)]
pub enum InvalidFinCategory<E> {
    /// Morphism assigned a domain not contained in the category.
    #[error("Domain of morphism `{0}` is not in the category")]
    Dom(E),

    /// Morphism assigned a codomain not contained in the category.
    #[error("Codomain of morphism `{0}` is not in the category")]
    Cod(E),

    /// Composite of a pair of morphisms is not defined.
    #[error("Composite of morphisms `{0}` and `{1}` is not defined")]
    Composite(E, E),

    /// Composite of a pair of morphisms has incompatible domain.
    #[error("Composite of morphisms `{0}` and `{1}` has incompatible domain")]
    CompositeDom(E, E),

    /// Composite of a pair of morphisms has incompatible codomain.
    #[error("Composite of morphisms `{0}` and `{1}` has incompatible codomain")]
    CompositeCod(E, E),
}

/** A finitely presented category.

Such a presentation is defined by a finite graph together with a set of path
equations. A morphism in the presented category is an *equivalence class* of
paths in the graph, so strictly speaking we work with morphism representatives
rather than morphism themselves.

Like the object and morphism generators, the equations are identified by keys.
Depending on the application, these could be axiom names or meaningless IDs.
 */
#[derive(Clone, Derivative, Debug)]
#[derivative(Default(bound = "S: Default"))]
#[derivative(PartialEq(bound = "V: Eq + Hash, E: Eq + Hash, EqKey: Eq + Hash, S: BuildHasher"))]
#[derivative(Eq(bound = "V: Eq + Hash, E: Eq + Hash, EqKey: Eq + Hash, S: BuildHasher"))]
pub struct FpCategory<V, E, EqKey, S = RandomState> {
    generators: HashGraph<V, E, S>,
    equations: HashColumn<EqKey, PathEq<V, E>, S>,
}

/// A finitely presented category with generators and equation keys of type
/// `Ustr`.
pub type UstrFpCategory = FpCategory<Ustr, Ustr, Ustr, BuildHasherDefault<IdentityHasher>>;

impl<V, E, EqKey, S> FpCategory<V, E, EqKey, S>
where
    V: Eq + Clone + Hash,
    E: Eq + Clone + Hash,
    EqKey: Eq + Clone + Hash,
    S: BuildHasher,
{
    /// Graph of generators of the finitely presented category.
    pub fn generators(&self) -> &impl FinGraph<V = V, E = E> {
        &self.generators
    }

    /// Get a path equation by key.
    pub fn get_equation(&self, key: &EqKey) -> Option<&PathEq<V, E>> {
        self.equations.apply(key)
    }

    /// Iterates over path equations in the presentation.
    pub fn equations(&self) -> impl Iterator<Item = &PathEq<V, E>> {
        self.equations.values()
    }

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
    pub fn add_mor_generator(&mut self, e: E, dom: V, cod: V) -> bool {
        self.generators.add_edge(e, dom, cod)
    }

    /// Adds a morphism generator without initializing its (co)domain.
    pub fn make_mor_generator(&mut self, e: E) -> bool {
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

    /// Adds a path equation to the presentation.
    pub fn add_equation(&mut self, key: EqKey, eq: PathEq<V, E>) {
        self.equations.set(key, eq);
    }

    /// Is the category freely generated?
    pub fn is_free(&self) -> bool {
        self.equations.is_empty()
    }

    /// Iterates over failures to be a well-defined presentation of a category.
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

impl<V, E, EqKey, S> Validate for FpCategory<V, E, EqKey, S>
where
    V: Eq + Clone + Hash,
    E: Eq + Clone + Hash,
    EqKey: Eq + Clone + Hash,
    S: BuildHasher,
{
    type ValidationError = InvalidFpCategory<E, EqKey>;

    fn validate(&self) -> Result<(), NonEmpty<Self::ValidationError>> {
        validate::wrap_errors(self.iter_invalid())
    }
}

impl<V, E, EqKey, S> Category for FpCategory<V, E, EqKey, S>
where
    V: Eq + Clone + Hash,
    E: Eq + Clone + Hash,
    EqKey: Eq + Clone + Hash,
    S: BuildHasher,
{
    type Ob = V;
    type Mor = Path<V, E>;

    fn has_ob(&self, x: &V) -> bool {
        self.generators.has_vertex(x)
    }
    fn has_mor(&self, path: &Path<V, E>) -> bool {
        path.contained_in(&self.generators)
    }
    fn dom(&self, path: &Path<V, E>) -> V {
        path.src(&self.generators)
    }
    fn cod(&self, path: &Path<V, E>) -> V {
        path.tgt(&self.generators)
    }

    fn compose(&self, path: Path<V, Path<V, E>>) -> Path<V, E> {
        path.flatten_in(&self.generators).expect("Paths should be composable")
    }
    fn compose2(&self, path1: Path<V, E>, path2: Path<V, E>) -> Path<V, E> {
        path1
            .concat_in(&self.generators, path2)
            .expect("Target of first path should equal source of second path")
    }
}

impl<V, E, EqKey, S> FgCategory for FpCategory<V, E, EqKey, S>
where
    V: Eq + Clone + Hash,
    E: Eq + Clone + Hash,
    EqKey: Eq + Clone + Hash,
    S: BuildHasher,
{
    type ObGen = V;
    type MorGen = E;

    fn object_generators(&self) -> impl Iterator<Item = Self::ObGen> {
        self.generators.vertices()
    }

    fn morphism_generators(&self) -> impl Iterator<Item = Self::MorGen> {
        self.generators.edges()
    }

    fn morphism_generator_dom(&self, f: &Self::MorGen) -> Self::Ob {
        self.generators.src(f)
    }

    fn morphism_generator_cod(&self, f: &Self::MorGen) -> Self::Ob {
        self.generators.tgt(f)
    }
}

/// A failure of a finite presentation of a category to be well defined.
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
        type Mor<V, E> = FinMor<V, E>;

        let mut sch_sgraph: FinCategory<char, char> = Default::default();
        sch_sgraph.add_ob_generators(['V', 'E']);
        sch_sgraph.add_mor_generator('s', 'E', 'V');
        sch_sgraph.add_mor_generator('t', 'E', 'V');
        sch_sgraph.add_mor_generator('i', 'E', 'E');
        assert_eq!(sch_sgraph.object_generators().count(), 2);
        assert_eq!(sch_sgraph.morphism_generators().count(), 3);
        assert_eq!(sch_sgraph.dom(&Mor::Generator('t')), 'E');
        assert_eq!(sch_sgraph.cod(&Mor::Generator('t')), 'V');
        assert_eq!(sch_sgraph.validate().unwrap_err().len(), 3);

        sch_sgraph.set_composite('i', 'i', Mor::Id('E'));
        sch_sgraph.set_composite('i', 's', Mor::Generator('t'));
        sch_sgraph.set_composite('i', 't', Mor::Generator('s'));
        assert!(sch_sgraph.validate().is_ok());
        assert_eq!(sch_sgraph.compose2(Mor::Generator('i'), Mor::Generator('i')), Mor::Id('E'));
        let path = Path::Seq(nonempty![
            Mor::Generator('i'),
            Mor::Id('E'),
            Mor::Generator('i'),
            Mor::Generator('i'),
            Mor::Generator('s'),
        ]);
        assert_eq!(sch_sgraph.compose(path), Mor::Generator('t'));
    }

    #[test]
    fn fp_category() {
        let mut sch_sgraph: FpCategory<_, _, _> = Default::default();
        sch_sgraph.add_ob_generators(['V', 'E']);
        sch_sgraph.add_mor_generator('s', 'E', 'V');
        sch_sgraph.add_mor_generator('t', 'E', 'V');
        sch_sgraph.add_mor_generator('i', 'E', 'E');
        assert!(sch_sgraph.is_free());
        assert_eq!(sch_sgraph.object_generators().count(), 2);
        assert_eq!(sch_sgraph.morphism_generators().count(), 3);
        assert_eq!(sch_sgraph.dom(&Path::single('t')), 'E');
        assert_eq!(sch_sgraph.cod(&Path::single('t')), 'V');
        assert!(sch_sgraph.validate().is_ok());

        sch_sgraph.add_equation("inv", PathEq::new(Path::pair('i', 'i'), Path::empty('E')));
        sch_sgraph.add_equation("rev_src", PathEq::new(Path::pair('i', 's'), Path::single('t')));
        sch_sgraph.add_equation("rev_tgt", PathEq::new(Path::pair('i', 't'), Path::single('s')));
        assert!(!sch_sgraph.is_free());
        assert_eq!(sch_sgraph.equations().count(), 3);
        assert!(sch_sgraph.validate().is_ok());

        let mut sch_bad: FpCategory<_, _, _> = Default::default();
        sch_bad.add_ob_generators(['x', 'y']);
        sch_bad.make_mor_generator('f');
        assert_eq!(sch_bad.validate().unwrap_err().len(), 2);
        sch_bad.set_dom('f', 'x');
        sch_bad.set_cod('f', 'y');
        assert!(sch_bad.validate().is_ok());
        sch_bad.add_mor_generator('g', 'y', 'x');
        sch_bad.add_equation('α', PathEq::new(Path::single('f'), Path::single('g')));
        assert_eq!(sch_bad.validate().unwrap_err().len(), 2);
    }
}
