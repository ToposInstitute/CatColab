/*! Paths in graphs and categories.

The central data type is [`Path`]. In addition, this module provides a simple
data type for [path equations](`PathEq`).
*/

use nonempty::{nonempty, NonEmpty};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify_next::Tsify;

use super::graph::Graph;
use crate::validate;

/** A path in a [graph](Graph) or [category](crate::one::category::Category).

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
#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(tag = "tag", content = "content"))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub enum Path<V, E> {
    /// The identity, or empty, path at a vertex.
    Id(V),

    /// A nontrivial path, comprising a *non-empty* vector of consecutive edges.
    Seq(NonEmpty<E>),
}

impl<V, E> Path<V, E> {
    /// Constructs the empty or identity path.
    pub fn empty(v: V) -> Self {
        Path::Id(v)
    }

    /// Constructs a path with a single edge.
    pub fn single(e: E) -> Self {
        Path::Seq(NonEmpty::singleton(e))
    }

    /// Constructs a pair of consecutive edges, or path of length 2.
    pub fn pair(e: E, f: E) -> Self {
        Path::Seq(nonempty![e, f])
    }

    /** Constructs a path from a vector of consecutive edges.

    Returns `None` if the vector is empty.
     */
    pub fn from_vec(vec: Vec<E>) -> Option<Self> {
        NonEmpty::from_vec(vec).map(Path::Seq)
    }

    /// Length of the path.
    pub fn len(&self) -> usize {
        match self {
            Path::Id(_) => 0,
            Path::Seq(edges) => edges.len(),
        }
    }

    /// Is the path empty?
    pub fn is_empty(&self) -> bool {
        match self {
            Path::Id(_) => true,
            Path::Seq(_) => false,
        }
    }

    /** Returns the unique edge in a path of length 1.

    This method is a one-sided inverse to [`Path::single`].
     */
    pub fn only(&self) -> Option<&E> {
        match self {
            Path::Id(_) => None,
            Path::Seq(edges) => {
                if edges.len() == 1 {
                    Some(edges.first())
                } else {
                    None
                }
            }
        }
    }

    /** Source of the path in the given graph.

    Assumes that the path is [contained in](Path::contained_in) the graph.
    */
    pub fn src<G>(&self, graph: &G) -> V
    where
        V: Clone,
        G: Graph<V = V, E = E>,
    {
        match self {
            Path::Id(v) => v.clone(),
            Path::Seq(edges) => graph.src(edges.first()),
        }
    }

    /** Target of the path in the given graph.

    Assumes that the path is [contained in](Path::contained_in) the graph.
    */
    pub fn tgt<G>(&self, graph: &G) -> V
    where
        V: Clone,
        G: Graph<V = V, E = E>,
    {
        match self {
            Path::Id(v) => v.clone(),
            Path::Seq(edges) => graph.tgt(edges.last()),
        }
    }

    /// Is the path contained in the given graph?
    pub fn contained_in<G>(&self, graph: &G) -> bool
    where
        V: Eq,
        G: Graph<V = V, E = E>,
    {
        match self {
            Path::Id(v) => graph.has_vertex(v),
            Path::Seq(edges) => {
                // All the edges are exist in the graph...
                edges.iter().all(|e| graph.has_edge(e)) &&
                // ...and their sources and target are compatible. Too strict?
                std::iter::zip(edges.iter(), edges.iter().skip(1)).all(
                    |(e,f)| graph.tgt(e) == graph.src(f))
            }
        }
    }

    /// Reduces a path using functions on vertices and edges.
    pub fn reduce<FnV, FnE>(self, fv: FnV, fe: FnE) -> E
    where
        FnV: FnOnce(V) -> E,
        FnE: FnMut(E, E) -> E,
    {
        match self {
            Path::Id(v) => fv(v),
            // `reduce` cannot fail since edge sequence is nonempty.
            Path::Seq(edges) => edges.into_iter().reduce(fe).unwrap(),
        }
    }

    /// Maps a path over functions on vertices and edges.
    pub fn map<CodV, CodE, FnV, FnE>(self, fv: FnV, fe: FnE) -> Path<CodV, CodE>
    where
        FnV: FnOnce(V) -> CodV,
        FnE: FnMut(E) -> CodE,
    {
        match self {
            Path::Id(v) => Path::Id(fv(v)),
            Path::Seq(edges) => Path::Seq(edges.map(fe)),
        }
    }

    /// Maps a path over partial functions on vertices and edges.
    pub fn partial_map<CodV, CodE, FnV, FnE>(self, fv: FnV, fe: FnE) -> Option<Path<CodV, CodE>>
    where
        FnV: FnOnce(V) -> Option<CodV>,
        FnE: FnMut(E) -> Option<CodE>,
    {
        match self {
            Path::Id(v) => {
                let w = fv(v)?;
                Some(Path::Id(w))
            }
            Path::Seq(edges) => {
                let edges: Option<Vec<_>> = edges.into_iter().map(fe).collect();
                let edges = edges?;
                Path::from_vec(edges)
            }
        }
    }

    /// Maps a path over fallible functions on vertices and edges.
    pub fn try_map<CodV, CodE, FnV, FnE, Err>(
        self,
        fv: FnV,
        fe: FnE,
    ) -> Result<Path<CodV, CodE>, Err>
    where
        FnV: FnOnce(V) -> Result<CodV, Err>,
        FnE: FnMut(E) -> Result<CodE, Err>,
    {
        match self {
            Path::Id(v) => {
                let w = fv(v)?;
                Ok(Path::Id(w))
            }
            Path::Seq(edges) => {
                let edges: Result<Vec<_>, _> = edges.into_iter().map(fe).collect();
                let edges = edges?;
                Ok(Path::from_vec(edges).unwrap())
            }
        }
    }
}

impl<V, E> Path<V, Path<V, E>> {
    /// Flatten a path of paths into a single path.
    pub fn flatten(self) -> Path<V, E> {
        match self {
            Path::Id(x) => Path::Id(x),
            Path::Seq(fs) => {
                if fs.iter().any(|p| matches!(p, Path::Seq(_))) {
                    let seqs = NonEmpty::collect(fs.into_iter().filter_map(|p| match p {
                        Path::Id(_) => None,
                        Path::Seq(gs) => Some(gs),
                    }));
                    Path::Seq(NonEmpty::flatten(seqs.unwrap()))
                } else {
                    fs.head // An identity.
                }
            }
        }
    }
}

/// A path in a graph with skeletal vertex and edge sets.
pub type SkelPath = Path<usize, usize>;

/// Assertion of an equation between the composites of two paths in a category.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PathEq<V, E> {
    /// Left hand side of equation.
    pub lhs: Path<V, E>,

    /// Right hand side of equation.
    pub rhs: Path<V, E>,
}

impl<V, E> PathEq<V, E> {
    /// Constructs a path equation with the given left- and right-hand sides.
    pub fn new(lhs: Path<V, E>, rhs: Path<V, E>) -> PathEq<V, E> {
        PathEq { lhs, rhs }
    }

    /** Source of the path equation in the given graph.

    Only well defined when the path equation is valid.
    */
    pub fn src<G>(&self, graph: &G) -> V
    where
        V: Clone,
        G: Graph<V = V, E = E>,
    {
        self.lhs.src(graph) // == self.rhs.src(graph)
    }

    /** Target of the path equation in the given graph.

    Only well defined when the path equation is valid.
    */
    pub fn tgt<G>(&self, graph: &G) -> V
    where
        V: Clone,
        G: Graph<V = V, E = E>,
    {
        self.lhs.tgt(graph) // == self.rhs.tgt(graph)
    }

    /// Validates that the path equation is well defined in the given graph.
    pub fn validate_in<G>(&self, graph: &G) -> Result<(), NonEmpty<InvalidPathEq>>
    where
        V: Eq + Clone,
        G: Graph<V = V, E = E>,
    {
        validate::wrap_errors(self.iter_invalid_in(graph))
    }

    /// Iterators over failures of the path equation to be well defined.
    pub fn iter_invalid_in<G>(&self, graph: &G) -> impl Iterator<Item = InvalidPathEq>
    where
        V: Eq + Clone,
        G: Graph<V = V, E = E>,
    {
        let mut errs = Vec::new();
        if !self.lhs.contained_in(graph) {
            errs.push(InvalidPathEq::Lhs());
        }
        if !self.rhs.contained_in(graph) {
            errs.push(InvalidPathEq::Rhs());
        }
        if errs.is_empty() {
            if self.lhs.src(graph) != self.rhs.src(graph) {
                errs.push(InvalidPathEq::Src());
            }
            if self.lhs.tgt(graph) != self.rhs.tgt(graph) {
                errs.push(InvalidPathEq::Tgt());
            }
        }
        errs.into_iter()
    }
}

/// A failure of a path equation to be well defined in a graph.
#[derive(Debug)]
pub enum InvalidPathEq {
    /// Path in left hand side of equation not contained in the graph.
    Lhs(),

    /// Path in right hand side of equation not contained in the graph.
    Rhs(),

    /// Sources of left and right hand sides of path equation are not equal.
    Src(),

    /// Targets of left and right hand sides of path equation are not equal.
    Tgt(),
}

#[cfg(test)]
mod tests {
    use super::super::graph::SkelGraph;
    use super::*;
    use std::convert::identity;

    #[test]
    fn path_in_graph() {
        let g = SkelGraph::triangle();
        assert!(Path::Id(2).contained_in(&g));
        assert!(!Path::Id(3).contained_in(&g));
        assert!(Path::pair(0, 1).contained_in(&g));
        assert!(!Path::pair(1, 0).contained_in(&g));

        let path = Path::pair(0, 1);
        assert_eq!(path.src(&g), 0);
        assert_eq!(path.tgt(&g), 2);
    }

    #[test]
    fn singleton_path() {
        let e = 1;
        assert_eq!(SkelPath::single(e).only(), Some(&e));
    }

    #[test]
    fn map_path() {
        assert_eq!(SkelPath::Id(1).map(|v| v + 1, identity), Path::Id(2));
        assert_eq!(SkelPath::pair(0, 1).map(identity, |e| e + 1), Path::pair(1, 2));
        assert_eq!(SkelPath::Id(1).partial_map(|v| Some(v + 1), Some), Some(Path::Id(2)));
        assert_eq!(SkelPath::pair(0, 1).partial_map(Some, |e| Some(e + 1)), Some(Path::pair(1, 2)));
    }

    #[test]
    fn path_eq() {
        let g = SkelGraph::triangle();
        let eq = PathEq::new(Path::pair(0, 1), Path::single(2));
        assert_eq!(eq.src(&g), 0);
        assert_eq!(eq.tgt(&g), 2);
        assert!(eq.validate_in(&g).is_ok());
    }
}
