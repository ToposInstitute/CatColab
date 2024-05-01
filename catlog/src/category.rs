//! Categories: interfaces and basic constructions.

use nonempty::{NonEmpty, nonempty};

use crate::graph::Graph;

/// A path in a graph or, more generally, in a category.
pub enum Path<V,E> {
    /// The identity, or empty, path at a vertex.
    Id(V),

    /// A nontrivial path, comprising a non-empty vector of consecutive edges.
    Seq(NonEmpty<E>)
}

/** A category.

We take the unbiased view of a category, regarding composition as an operation
on paths in the underlying graph. This has several advantages. First, it takes
as primitive the natural data structure for morphisms in a free category, or
more generally in a presentation of a category. It also enables more intelligent
strategies for evaluating composites in specific categories. For instance, when
composing (multiplying) a sequence of matrices, it can be very inefficient to
fold from the left or right by binary matrix multiplication. Instead, one might
solve the "matrix chain multiplication" problem to find an optimal ordering.
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
    fn dom(&self, f: &Self::Hom) -> &Self::Ob;

    /// Gets the codomain of a morphism in the category.
    fn cod(&self, f: &Self::Hom) -> &Self::Ob;

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
    /// Creates the underlying graph of a category.
    pub fn new(category: Cat) -> Self { Self {0: category} }
}

impl<Cat: Category> Graph for UnderlyingGraph<Cat> {
    type V = Cat::Ob;
    type E = Cat::Hom;

    fn has_vertex(&self, x: &Self::V) -> bool { self.0.has_ob(x) }
    fn has_edge(&self, f: &Self::E) -> bool { self.0.has_hom(f) }
    fn src(&self, f: &Self::E) -> &Self::V { self.0.dom(f) }
    fn tgt(&self, f: &Self::E) -> &Self::V { self.0.cod(f) }
}
