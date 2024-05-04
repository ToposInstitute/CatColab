/*! Categories: interfaces and basic constructions.
 */

use ref_cast::RefCast;
use nonempty::{NonEmpty, nonempty};

use crate::set::{Set, FinSet};
use crate::graph::{Graph, FinGraph};

/** A path in a [graph](Graph) or a [category](Category).

This definition by cases can be compared with the perhaps more obvious
definition:

```
struct Path<V, E> {
    start: V,
    end: V, // Optional: more symmetric but also more redundant.
    seq: Vec<E>,
}
```

Not only does the single struct store redundant (hence possibly inconsistent)
information when the sequence of edges is nonempty, one will often need to do a
case analysis on the edge sequence anyway to determine whether, say,
[`fold`](std::iter::Iterator::fold) can be called or the result of
[`reduce`](std::iter::Iterator::reduce) is valid. Thus, it seems better to reify
the two cases in the data structure itself.
*/
#[derive(Clone,Debug,PartialEq,Eq)]
pub enum Path<V,E> {
    /// The identity, or empty, path at a vertex.
    Id(V),

    /// A nontrivial path, comprising a *non-empty* vector of consecutive edges.
    Seq(NonEmpty<E>)
}

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
    type Ob: Eq;

    /// Type of morphisms in category.
    type Hom: Eq;

    /// Does the category contain the value as an object?
    fn has_ob(&self, x: &Self::Ob) -> bool;

    /// Does the category contain the value as a morphism?
    fn has_hom(&self, f: &Self::Hom) -> bool;

    /// Gets the domain of a morphism in the category.
    fn dom(&self, f: &Self::Hom) -> Self::Ob;

    /// Gets the codomain of a morphism in the category.
    fn cod(&self, f: &Self::Hom) -> Self::Ob;

    /// Composes a path of morphisms in the category.
    fn compose(&self, path: Path<Self::Ob,Self::Hom>) -> Self::Hom;

    /// Composes a pair of morphisms with compatible (co)domains.
    fn compose2(&self, f: Self::Hom, g: Self::Hom) -> Self::Hom {
        self.compose(Path::Seq::<Self::Ob,_>(nonempty![f, g]))
    }

    /// Constructs the identity morphism at an object.
    fn id(&self, x: Self::Ob) -> Self::Hom {
        self.compose(Path::Id::<_,Self::Hom>(x))
    }
}

/// The set of objects of a category.
#[derive(RefCast)]
#[repr(transparent)]
pub struct ObSet<Cat>(Cat);

impl<Cat> ObSet<Cat> {
    /// Extracts the set of objects of the given category.
    pub fn new(category: Cat) -> Self { Self {0: category} }
}

impl<Cat: Category> Set for ObSet<Cat> {
    type Elem = Cat::Ob;

    fn contains(&self, x: &Cat::Ob) -> bool { self.0.has_ob(x) }
}

/** The discrete category on a set.

The objects of the category are the elements of the set, and the only morphisms
are the identities, which can thus be identified with the objects.
 */
#[derive(RefCast)]
#[repr(transparent)]
pub struct DiscreteCategory<S>(S);

impl<S> DiscreteCategory<S> {
    /// Constructs the discrete category on the given set.
    pub fn new(set: S) -> Self { Self {0: set} }
}

impl<S: Set> Category for DiscreteCategory<S> where S::Elem: Clone {
    type Ob = S::Elem;
    type Hom = S::Elem;

    fn has_ob(&self, x: &S::Elem) -> bool { self.0.contains(x) }
    fn has_hom(&self, f: &S::Elem) -> bool { self.0.contains(f) }
    fn dom(&self, x: &S::Elem) -> S::Elem { x.clone() }
    fn cod(&self, x: &S::Elem) -> S::Elem { x.clone() }

    fn compose(&self, path: Path<S::Elem,S::Elem>) -> S::Elem {
        match path {
            Path::Id(x) => x,
            Path::Seq(xs) => {
                let x = xs.head;
                assert!(xs.tail.into_iter().all(|y| x == y),
                        "Cannot compose identities on different objects");
                x
            }
        }
    }
}

/** The underlying graph of a category.

The vertices and edges of the graph are the objects and morphisms of the
category, respectively.
 */
#[derive(RefCast)]
#[repr(transparent)]
pub struct UnderlyingGraph<Cat>(Cat);

impl<Cat> UnderlyingGraph<Cat> {
    /// Extracts the underlying graph of the given category.
    pub fn new(category: Cat) -> Self { Self {0: category} }
}

impl<Cat: Category> Graph for UnderlyingGraph<Cat> {
    type V = Cat::Ob;
    type E = Cat::Hom;

    fn has_vertex(&self, x: &Self::V) -> bool { self.0.has_ob(x) }
    fn has_edge(&self, f: &Self::E) -> bool { self.0.has_hom(f) }
    fn src(&self, f: &Self::E) -> Self::V { self.0.dom(f) }
    fn tgt(&self, f: &Self::E) -> Self::V { self.0.cod(f) }
}

/** The free category on a graph.

The objects and morphisms of the free category are the vertices and *paths* in
the graph, respectively. Paths compose by concatenation.
 */
#[derive(RefCast)]
#[repr(transparent)]
pub struct FreeCategory<G>(G);

impl<G> FreeCategory<G> {
    /// Constructs the free category on the given graph.
    pub fn new(graph: G) -> Self { Self {0: graph} }
}

impl<G: Graph> Category for FreeCategory<G> where G::V: Clone {
    type Ob = G::V;
    type Hom = Path<G::V,G::E>;

    fn has_ob(&self, x: &G::V) -> bool {
        self.0.has_vertex(x)
    }

    fn has_hom(&self, path: &Path<G::V,G::E>) -> bool {
        match path {
            Path::Id(x) => self.0.has_vertex(x),
            Path::Seq(fs) => {
                // All the edges are exist in the graph...
                fs.iter().all(|f| self.0.has_edge(f)) &&
                // ...and their sources and target are compatible. Too strict?
                std::iter::zip(fs.iter(), fs.iter().skip(1)).all(
                    |(f,g)| self.0.tgt(f) == self.0.src(g))
            }
        }
    }

    fn dom(&self, path: &Path<G::V,G::E>) -> G::V {
        match path {
            Path::Id(x) => x.clone(),
            Path::Seq(fs) => self.0.src(fs.first()),
        }
    }

    fn cod(&self, path: &Path<G::V,G::E>) -> G::V {
        match path {
            Path::Id(x) => x.clone(),
            Path::Seq(fs) => self.0.tgt(fs.last()),
        }
    }

    fn compose(&self, path: Path<G::V,Path<G::V,G::E>>) -> Path<G::V,G::E> {
        match path {
            Path::Id(x) => Path::Id(x),
            Path::Seq(fs) => {
                if fs.iter().any(|p| matches!(p, Path::Seq(_))) {
                    let seqs = NonEmpty::collect(fs.into_iter().filter_map(|p| {
                        match p {
                            Path::Id(_) => None,
                            Path::Seq(gs) => Some(gs)
                        }
                    }));
                    Path::Seq(NonEmpty::flatten(seqs.unwrap()))
                } else {
                    fs.head // An identity.
                }
            }
        }
    } 
}

/** A finitely generated category with specified object and morphism generators.

Such a category has finitely many objects, which usually coincide with the
object generators (unless there are nontrivial equations between objects), but
can have infinitely many morphisms.
 */
pub trait FgCategory: Category {
    /// Is the object a generator of the category? Implies `self.has_ob(x)`.
    fn has_ob_generator(&self, x: &Self::Ob) -> bool;

    /// Is the morphism a generator of the category? Implies `self.has_hom(f)`.
    fn has_hom_generator(&self, f: &Self::Hom) -> bool;

    /// Iterates over object generators of the category.
    fn ob_generators(&self) -> impl Iterator<Item = Self::Ob>;

    /// Iterates over all morphism generators of the category.
    fn hom_generators(&self) -> impl Iterator<Item = Self::Hom>;

    /// Iterates over morphism generators with the given domain.
    fn generators_with_dom(&self, x: &Self::Ob) -> impl Iterator<Item = Self::Hom>;

    /// Iterates over morphism generators with the given codomain.
    fn generators_with_cod(&self, x: &Self::Ob) -> impl Iterator<Item = Self::Hom>;
}

impl<S: FinSet> FgCategory for DiscreteCategory<S> where S::Elem: Clone {
    fn has_ob_generator(&self, x: &S::Elem) -> bool { self.0.contains(x) }
    fn has_hom_generator(&self, _: &S::Elem) -> bool { false }
    fn ob_generators(&self) -> impl Iterator<Item=S::Elem> { self.0.iter() }
    fn hom_generators(&self) -> impl Iterator<Item=S::Elem> {
        std::iter::empty::<S::Elem>()
    }
    fn generators_with_dom(&self, _: &S::Elem) -> impl Iterator<Item=S::Elem> {
        std::iter::empty::<S::Elem>()
    }
    fn generators_with_cod(&self, _: &S::Elem) -> impl Iterator<Item=S::Elem> {
        std::iter::empty::<S::Elem>()
    }
}

/** The generating graph of a finitely generated category.

The vertices and edges of the graph are the object and morphism generators.
*/
#[derive(RefCast)]
#[repr(transparent)]
pub struct GeneratingGraph<Cat>(Cat);

impl<Cat> GeneratingGraph<Cat> {
    /// Constructs the generating graph of the given category.
    pub fn new(category: Cat) -> Self { Self {0: category} }
}

impl<Cat: FgCategory> Graph for GeneratingGraph<Cat> {
    type V = Cat::Ob;
    type E = Cat::Hom;

    fn has_vertex(&self, x: &Self::V) -> bool { self.0.has_ob_generator(x) }
    fn has_edge(&self, f: &Self::E) -> bool { self.0.has_hom_generator(f) }
    fn src(&self, f: &Self::E) -> Self::V { self.0.dom(f) }
    fn tgt(&self, f: &Self::E) -> Self::V { self.0.cod(f) }
}

impl<Cat: FgCategory> FinGraph for GeneratingGraph<Cat> {
    fn vertices(&self) -> impl Iterator<Item = Self::V> {
        self.0.ob_generators()
    }
    fn edges(&self) -> impl Iterator<Item = Self::E> {
        self.0.hom_generators()
    }
    fn in_edges(&self, x: &Self::V) -> impl Iterator<Item = Self::E> {
        self.0.generators_with_cod(x)
    }
    fn out_edges(&self, x: &Self::V) -> impl Iterator<Item = Self::E> {
        self.0.generators_with_dom(x)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::set::SkelFinSet;
    use crate::graph::SkelFinGraph;

    #[test]
    fn discrete_category() {
        let cat = DiscreteCategory(SkelFinSet::new(3));
        assert!(cat.has_ob(&2));
        assert!(cat.has_hom(&2));
        assert!(!cat.has_hom(&3));
        assert_eq!(cat.dom(&1), 1);
        assert_eq!(cat.cod(&1), 1);
        assert_eq!(cat.compose(Path::Seq(nonempty![1, 1, 1])), 1);
    }

    #[test]
    fn free_category() {
        let cat = FreeCategory(SkelFinGraph::triangle());
        assert!(cat.has_ob(&2));

        let id = Path::Id(1);
        assert!(cat.has_hom(&id));
        assert_eq!(cat.dom(&id), 1);
        assert_eq!(cat.cod(&id), 1);

        let path = Path::Seq(nonempty![0,1]);
        assert!(cat.has_hom(&path));
        assert!(!cat.has_hom(&Path::Seq(nonempty![0,2])));
        assert_eq!(cat.dom(&path), 0);
        assert_eq!(cat.cod(&path), 2);

        let cat = FreeCategory(SkelFinGraph::path(5));
        let path = Path::Seq(nonempty![
            Path::Id(0), Path::Seq(nonempty![0,1]),
            Path::Id(2), Path::Seq(nonempty![2,3]), Path::Id(4),
        ]);
        assert_eq!(cat.compose(path), Path::Seq(nonempty![0,1,2,3]));
    }
}
