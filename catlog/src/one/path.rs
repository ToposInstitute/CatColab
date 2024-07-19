//! Paths in graphs and categories.

use nonempty::{NonEmpty, nonempty};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify_next::Tsify;

use super::graph::Graph;

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
#[derive(Clone,Debug,PartialEq,Eq)]
#[cfg_attr(feature = "serde", derive(Serialize,Deserialize))]
#[cfg_attr(feature = "serde", serde(tag = "tag", content = "content"))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub enum Path<V,E> {
    /// The identity, or empty, path at a vertex.
    Id(V),

    /// A nontrivial path, comprising a *non-empty* vector of consecutive edges.
    Seq(NonEmpty<E>)
}

impl<V,E> Path<V,E> {
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

    /// Length of the path.
    pub fn len(&self) -> usize {
        match self {
            Path::Id(_) => 0,
            Path::Seq(edges) => edges.len(),
        }
    }

    /** Source of the path in the given graph.

    Assumes that the path is [contained in](Path::contained_in) the graph.
    */
    pub fn src<G>(&self, graph: &G) -> V where V: Clone, G: Graph<V=V, E=E> {
        match self {
            Path::Id(v) => v.clone(),
            Path::Seq(edges) => graph.src(edges.first()),
        }
    }

    /** Target of the path in the given graph.

    Assumes that the path is [contained in](Path::contained_in) the graph.
    */
    pub fn tgt<G>(&self, graph: &G) -> V where V: Clone, G: Graph<V=V, E=E> {
        match self {
            Path::Id(v) => v.clone(),
            Path::Seq(edges) => graph.tgt(edges.last()),
        }
    }

    /// Is the path contained in the given graph?
    pub fn contained_in<G>(&self, graph: &G) -> bool
    where V: Eq, G: Graph<V=V, E=E> {
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

    /// Maps a path over functions on vertices and edges.
    pub fn map<CodV, CodE, FnV, FnE>(self, fv: FnV, fe: FnE
    ) -> Path<CodV, CodE>
    where FnV: FnOnce(V) -> CodV, FnE: FnMut(E) -> CodE {
        match self {
            Path::Id(v) => Path::Id(fv(v)),
            Path::Seq(edges) => Path::Seq(edges.map(fe)),
        }
    }

    /// Maps a path over fallible functions on vertices and edges.
    pub fn try_map<CodV, CodE, FnV, FnE>(self, fv: FnV, fe: FnE
    ) -> Option<Path<CodV, CodE>>
    where FnV: FnOnce(V) -> Option<CodV>, FnE: FnMut(E) -> Option<CodE> {
        match self {
            Path::Id(v) => {
                let w = fv(v)?;
                Some(Path::Id(w))
            },
            Path::Seq(edges) => {
                let edges: Option<Vec<_>> = edges.into_iter().map(fe).collect();
                let edges = edges?;
                Some(Path::Seq(NonEmpty::from_vec(edges).unwrap()))
            }
        }
    }
}

/// A path in a graph with skeletal vertex and edge sets.
pub type SkelPath = Path<usize, usize>;

#[cfg(test)]
mod tests {
    use std::convert::identity;
    use super::*;
    use super::super::graph::SkelGraph;

    #[test]
    fn path_in_graph() {
        let g = SkelGraph::triangle();
        assert!(Path::Id(2).contained_in(&g));
        assert!(!Path::Id(3).contained_in(&g));
        assert!(Path::pair(0,1).contained_in(&g));
        assert!(!Path::pair(1,0).contained_in(&g));

        let path = Path::pair(0,1);
        assert_eq!(path.src(&g), 0);
        assert_eq!(path.tgt(&g), 2);
    }

    #[test]
    fn map_path() {
        assert_eq!(SkelPath::Id(1).map(|v| v+1, identity),
                   Path::Id(2));
        assert_eq!(SkelPath::pair(0,1).map(identity, |e| e+1),
                   Path::pair(1,2));
        assert_eq!(SkelPath::Id(1).try_map(|v| Some(v+1), |e| Some(e)),
                   Some(Path::Id(2)));
        assert_eq!(SkelPath::pair(0,1).try_map(|v| Some(v), |e| Some(e+1)),
                   Some(Path::pair(1,2)));
    }
}
