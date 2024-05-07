//! Paths in graphs or categories.

use nonempty::{NonEmpty, nonempty};

use crate::graph::Graph;

/** A path in a [graph](crate::graph::Graph) or [category](crate::category::Category).

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

impl<V,E> Path<V,E> {
    /// Constructs the empty or identity path.
    pub fn empty(v: V) -> Self {
        Path::Id(v)
    }

    /// Constructs a pair of consecutive edges, or path of length 2.
    pub fn pair(e: E, f: E) -> Self {
        Path::Seq(nonempty![e, f])
    }

    /// Is the path contained in the given graph?
    pub fn contained_in<G>(&self, graph: &G) -> bool
    where V: Eq, G: Graph<V=V, E=E> {
        match self {
            Path::Id(v) => graph.has_vertex(v),
            Path::Seq(es) => {
                // All the edges are exist in the graph...
                es.iter().all(|e| graph.has_edge(e)) &&
                // ...and their sources and target are compatible. Too strict?
                std::iter::zip(es.iter(), es.iter().skip(1)).all(
                    |(e,f)| graph.tgt(e) == graph.src(f))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graph::SkelFinGraph;

    #[test]
    fn path_contained_in_graph() {
        let g = SkelFinGraph::triangle();
        assert!(Path::Id(2).contained_in(&g));
        assert!(!Path::Id(3).contained_in(&g));
        assert!(Path::pair(0,1).contained_in(&g));
        assert!(!Path::pair(1,0).contained_in(&g));
    }
}
