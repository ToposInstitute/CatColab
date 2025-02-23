/*! Categories: interfaces and basic constructions.
 */

use derive_more::From;
use ref_cast::RefCast;

use super::graph::{FinGraph, Graph};
use super::path::Path;
use crate::zero::{FinSet, Set};

/** A category.

We take the unbiased view of categories, meaning that composition is an
operation on [paths](Path) of arbitrary finite length. This has several
advantages. First, it takes as primitive the natural data structure for
morphisms in a free category, or more generally in a presentation of a category.
It also enables more intelligent strategies for evaluating composites in
specific categories. For instance, when composing (multiplying) a sequence of
matrices, it can be very inefficient to just fold from the left or right,
compared to multiplying in the [optimal
order](https://en.wikipedia.org/wiki/Matrix_chain_multiplication).
 */
pub trait Category {
    /// Type of objects in category.
    type Ob: Eq + Clone;

    /// Type of morphisms in category.
    type Mor: Eq + Clone;

    /// Does the category contain the value as an object?
    fn has_ob(&self, x: &Self::Ob) -> bool;

    /// Does the category contain the value as a morphism?
    fn has_mor(&self, f: &Self::Mor) -> bool;

    /// Gets the domain of a morphism in the category.
    fn dom(&self, f: &Self::Mor) -> Self::Ob;

    /// Gets the codomain of a morphism in the category.
    fn cod(&self, f: &Self::Mor) -> Self::Ob;

    /// Composes a path of morphisms in the category.
    fn compose(&self, path: Path<Self::Ob, Self::Mor>) -> Self::Mor;

    /// Composes a pair of morphisms with compatible (co)domains.
    fn compose2(&self, f: Self::Mor, g: Self::Mor) -> Self::Mor {
        self.compose(Path::pair(f, g))
    }

    /// Constructs the identity morphism at an object.
    fn id(&self, x: Self::Ob) -> Self::Mor {
        self.compose(Path::empty(x))
    }
}

/// The set of objects of a category.
#[derive(From, RefCast)]
#[repr(transparent)]
pub struct ObSet<Cat: Category>(Cat);

impl<Cat: Category> Set for ObSet<Cat> {
    type Elem = Cat::Ob;

    fn contains(&self, x: &Cat::Ob) -> bool {
        self.0.has_ob(x)
    }
}

/** The discrete category on a set.

The objects of the category are the elements of the set, and the only morphisms
are the identities, which can thus be identified with the objects.
 */
#[derive(From, RefCast)]
#[repr(transparent)]
pub struct DiscreteCategory<S: Set>(S);

impl<S: Set> Category for DiscreteCategory<S> {
    type Ob = S::Elem;
    type Mor = S::Elem;

    fn has_ob(&self, x: &S::Elem) -> bool {
        self.0.contains(x)
    }
    fn has_mor(&self, f: &S::Elem) -> bool {
        self.0.contains(f)
    }
    fn dom(&self, x: &S::Elem) -> S::Elem {
        x.clone()
    }
    fn cod(&self, x: &S::Elem) -> S::Elem {
        x.clone()
    }

    fn compose(&self, path: Path<S::Elem, S::Elem>) -> S::Elem {
        match path {
            Path::Id(x) => x,
            Path::Seq(xs) => {
                let x = xs.head;
                assert!(
                    xs.tail.into_iter().all(|y| x == y),
                    "Cannot compose identities on different objects"
                );
                x
            }
        }
    }
}

/** The underlying graph of a category.

The vertices and edges of the graph are the objects and morphisms of the
category, respectively.
 */
#[derive(From, RefCast)]
#[repr(transparent)]
pub struct UnderlyingGraph<Cat: Category>(Cat);

impl<Cat: Category> Graph for UnderlyingGraph<Cat> {
    type V = Cat::Ob;
    type E = Cat::Mor;

    fn has_vertex(&self, x: &Self::V) -> bool {
        self.0.has_ob(x)
    }
    fn has_edge(&self, f: &Self::E) -> bool {
        self.0.has_mor(f)
    }
    fn src(&self, f: &Self::E) -> Self::V {
        self.0.dom(f)
    }
    fn tgt(&self, f: &Self::E) -> Self::V {
        self.0.cod(f)
    }
}

/** The free category on a graph.

The objects and morphisms of the free category are the vertices and *paths* in
the graph, respectively. Paths compose by concatenation.
 */
#[derive(From, RefCast)]
#[repr(transparent)]
pub struct FreeCategory<G: Graph>(G);

impl<G: Graph> Category for FreeCategory<G> {
    type Ob = G::V;
    type Mor = Path<G::V, G::E>;

    fn has_ob(&self, x: &G::V) -> bool {
        self.0.has_vertex(x)
    }
    fn has_mor(&self, path: &Path<G::V, G::E>) -> bool {
        path.contained_in(&self.0)
    }
    fn dom(&self, path: &Path<G::V, G::E>) -> G::V {
        path.src(&self.0)
    }
    fn cod(&self, path: &Path<G::V, G::E>) -> G::V {
        path.tgt(&self.0)
    }

    fn compose(&self, path: Path<G::V, Path<G::V, G::E>>) -> Path<G::V, G::E> {
        path.flatten_in(&self.0).expect("Paths should be composable")
    }
    fn compose2(&self, path1: Path<G::V, G::E>, path2: Path<G::V, G::E>) -> Path<G::V, G::E> {
        path1
            .concat_in(&self.0, path2)
            .expect("Target of first path should equal source of second path")
    }
}

/** A finitely generated category with specified object and morphism generators.

Unless the category has extra structure like a monoidal product, a finitely
generated (f.g.) category has finitely many objects. Moreover, the objects will
coincide with the object generators in the typical case that there are no
equations between objects. On the other hand, a f.g. category can have
infinitely many morphisms and often does.
 */
pub trait FgCategory: Category {
    /** Type of an object generator.

    In simple cases, `Ob = ObGen`.
     */
    type ObGen: Eq + Clone + Into<Self::Ob>;

    /** Type of a morphism generator

    Often `Mor = Path<Ob, MorGen>`.
     */
    type MorGen: Eq + Clone + Into<Self::Mor>;

    /// Iterates over object generators.
    fn ob_generators(&self) -> impl Iterator<Item = Self::ObGen>;

    /// Iterates over morphism generators.
    fn mor_generators(&self) -> impl Iterator<Item = Self::MorGen>;

    /// The domain of a morphism generator
    fn mor_generator_dom(&self, f: &Self::MorGen) -> Self::Ob;

    /// The codomain of a morphism generator
    fn mor_generator_cod(&self, f: &Self::MorGen) -> Self::Ob;

    /// Iterates over basic objects.
    fn objects(&self) -> impl Iterator<Item = Self::Ob> {
        self.ob_generators().map(|ob_gen| ob_gen.into())
    }

    /// Iterates over basic morphisms.
    fn morphisms(&self) -> impl Iterator<Item = Self::Mor> {
        self.mor_generators().map(|mor_gen| mor_gen.into())
    }
}

impl<S: FinSet> Graph for DiscreteCategory<S> {
    type V = S::Elem;
    type E = S::Elem;

    fn has_edge(&self, e: &Self::E) -> bool {
        self.0.contains(e)
    }

    fn has_vertex(&self, v: &Self::V) -> bool {
        self.0.contains(v)
    }

    fn src(&self, e: &Self::E) -> Self::V {
        e.clone()
    }

    fn tgt(&self, e: &Self::E) -> Self::V {
        e.clone()
    }
}

impl<S: FinSet> FinGraph for DiscreteCategory<S> {
    fn edges(&self) -> impl Iterator<Item = Self::E> {
        self.0.iter()
    }

    fn vertices(&self) -> impl Iterator<Item = Self::V> {
        self.0.iter()
    }

    fn degree(&self, _v: &Self::V) -> usize {
        2
    }

    fn in_edges(&self, v: &Self::V) -> impl Iterator<Item = Self::E> {
        std::iter::once(v.clone())
    }

    fn out_edges(&self, v: &Self::V) -> impl Iterator<Item = Self::E> {
        std::iter::once(v.clone())
    }

    fn in_degree(&self, _v: &Self::V) -> usize {
        1
    }

    fn out_degree(&self, _v: &Self::V) -> usize {
        1
    }
}

impl<S: FinSet> FgCategory for DiscreteCategory<S> {
    type ObGen = S::Elem;
    type MorGen = S::Elem;

    fn ob_generators(&self) -> impl Iterator<Item = Self::ObGen> {
        self.0.iter()
    }

    fn mor_generators(&self) -> impl Iterator<Item = Self::MorGen> {
        self.0.iter()
    }

    fn mor_generator_dom(&self, f: &Self::MorGen) -> Self::Ob {
        f.clone()
    }

    fn mor_generator_cod(&self, f: &Self::MorGen) -> Self::Ob {
        f.clone()
    }
}

impl<G: FinGraph> FgCategory for FreeCategory<G> {
    type ObGen = G::V;
    type MorGen = G::E;

    fn ob_generators(&self) -> impl Iterator<Item = Self::ObGen> {
        self.0.vertices()
    }

    fn mor_generators(&self) -> impl Iterator<Item = Self::MorGen> {
        self.0.edges()
    }

    fn mor_generator_dom(&self, f: &Self::MorGen) -> Self::Ob {
        self.0.src(f)
    }

    fn mor_generator_cod(&self, f: &Self::MorGen) -> Self::Ob {
        self.0.tgt(f)
    }
}

#[cfg(test)]
mod tests {
    use nonempty::nonempty;

    use super::super::graph::SkelGraph;
    use super::*;
    use crate::zero::SkelFinSet;

    #[test]
    fn discrete_category() {
        let cat = DiscreteCategory::from(SkelFinSet::from(3));
        assert!(cat.has_ob(&2));
        assert!(cat.has_mor(&2));
        assert!(!cat.has_mor(&3));
        assert_eq!(cat.dom(&1), 1);
        assert_eq!(cat.cod(&1), 1);
        assert_eq!(cat.compose(Path::Seq(nonempty![1, 1, 1])), 1);
    }

    #[test]
    fn free_category() {
        let cat = FreeCategory::from(SkelGraph::triangle());
        assert!(cat.has_ob(&2));
        assert_eq!(cat.ob_generators().count(), 3);
        assert_eq!(cat.mor_generators().count(), 3);

        let id = Path::Id(1);
        assert!(cat.has_mor(&id));
        assert_eq!(cat.dom(&id), 1);
        assert_eq!(cat.cod(&id), 1);

        let path = Path::pair(0, 1);
        assert!(cat.has_mor(&path));
        assert!(!cat.has_mor(&Path::pair(0, 2)));
        assert_eq!(cat.dom(&path), 0);
        assert_eq!(cat.cod(&path), 2);

        let cat = FreeCategory::from(SkelGraph::path(5));
        let path = Path::Seq(nonempty![
            Path::Id(0),
            Path::pair(0, 1),
            Path::Id(2),
            Path::pair(2, 3),
            Path::Id(4),
        ]);
        let result = Path::Seq(nonempty![0, 1, 2, 3]);
        assert_eq!(cat.compose(path), result);
        assert_eq!(cat.compose2(Path::pair(0, 1), Path::pair(2, 3)), result);
    }
}
