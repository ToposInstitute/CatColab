/*! Categories: interfaces and basic constructions.

We take the unbiased view of categories, meaning that composition is as an
operation on paths of arbitrary finite length. This has several advantages.
First, it takes as primitive the natural data structure for morphisms in a free
category, or more generally in a presentation of a category. It also enables
more intelligent strategies for evaluating composites in specific categories.
For instance, when composing (multiplying) a sequence of matrices, it can be
very inefficient to fold from the left or right by binary matrix multiplication.
Instead, one might solve the "matrix chain multiplication" problem to find an
optimal ordering.
*/

use nonempty::{NonEmpty, nonempty};

use crate::graph::Graph;

/// A path in a graph or, more generally, in a category.
#[derive(Clone,Debug,PartialEq,Eq)]
pub enum Path<V,E> {
    /// The identity, or empty, path at a vertex.
    Id(V),

    /// A nontrivial path, comprising a non-empty vector of consecutive edges.
    Seq(NonEmpty<E>)
}

/** A category.
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
    fn dom<'a>(&'a self, f: &'a Self::Hom) -> &Self::Ob;

    /// Gets the codomain of a morphism in the category.
    fn cod<'a>(&'a self, f: &'a Self::Hom) -> &Self::Ob;

    /// Composes a path of morphisms in the category.
    fn compose(&self, path: Path<Self::Ob,Self::Hom>) -> Self::Hom;

    /// Constructs the identity morphism at an object.
    fn id(&self, x: Self::Ob) -> Self::Hom {
        self.compose(Path::Id::<_,Self::Hom>(x))
    }

    /// Composes a consecutive pair of morphisms.
    fn compose2(&self, f: Self::Hom, g: Self::Hom) -> Self::Hom {
        self.compose(Path::Seq::<Self::Ob,_>(nonempty![f, g]))
    }
}

/** The underlying graph of a category.

The vertices and edges of the graph are the objects and morphisms of the
category, respectively.
 */
pub struct UnderlyingGraph<Cat>(Cat);

impl<Cat> UnderlyingGraph<Cat> {
    /// Creates the underlying graph of the given category.
    pub fn new(category: Cat) -> Self { Self {0: category} }
}

impl<Cat: Category> Graph for UnderlyingGraph<Cat> {
    type V = Cat::Ob;
    type E = Cat::Hom;

    fn has_vertex(&self, x: &Self::V) -> bool { self.0.has_ob(x) }
    fn has_edge(&self, f: &Self::E) -> bool { self.0.has_hom(f) }
    fn src<'a>(&'a self, f: &'a Self::E) -> &Self::V { self.0.dom(f) }
    fn tgt<'a>(&'a self, f: &'a Self::E) -> &Self::V { self.0.cod(f) }
}

/** The free category on a graph.

The objects and morphisms of the free category are the vertices and *paths* in
the graph, respectively. Paths compose by concatentation.
 */
pub struct FreeCategory<G>(G);

impl<G> FreeCategory<G> {
    /// Creates the free category on the given graph.
    pub fn new(graph: G) -> Self { Self {0: graph} }
}

impl<G: Graph> Category for FreeCategory<G> {
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

    fn dom<'a>(&'a self, path: &'a Path<G::V,G::E>) -> &G::V {
        match path {
            Path::Id(x) => x,
            Path::Seq(fs) => self.0.src(fs.first()),
        }
    }

    fn cod<'a>(&'a self, path: &'a Path<G::V,G::E>) -> &G::V {
        match path {
            Path::Id(x) => x,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graph::SkelFinGraph;

    #[test]
    fn free_category() {
        let cat = FreeCategory(SkelFinGraph::triangle());
        assert!(cat.has_ob(&2));

        let id = Path::Id(1);
        assert!(cat.has_hom(&id));
        assert_eq!(*cat.dom(&id), 1);
        assert_eq!(*cat.cod(&id), 1);

        let path = Path::Seq(nonempty![0,1]);
        assert!(cat.has_hom(&path));
        assert!(!cat.has_hom(&Path::Seq(nonempty![0,2])));
        assert_eq!(*cat.dom(&path), 0);
        assert_eq!(*cat.cod(&path), 2);

        let cat = FreeCategory(SkelFinGraph::path(5));
        let path = Path::Seq(nonempty![
            Path::Id(0), Path::Seq(nonempty![0,1]),
            Path::Id(2), Path::Seq(nonempty![2,3]), Path::Id(4),
        ]);
        assert_eq!(cat.compose(path), Path::Seq(nonempty![0,1,2,3]));
    }
}
