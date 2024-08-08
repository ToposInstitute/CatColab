//! Algorithms on graphs.

use std::collections::{HashSet, VecDeque};
use std::hash::Hash;

use super::graph::*;

/** Arrange all the elements of a graph in specialization order.

The [specialization
order](https://en.wikipedia.org/wiki/Specialization_(pre)order) is the preorder
associated with the [Alexandrov
topology](https://en.wikipedia.org/wiki/Alexandrov_topology) on the graph.
Equivalently, it is the preorder reflection of the category of elements of the
graph. In simple terms, this means that every edge is greater than its source
and its target.

This function computes a total ordering of the elements of the graph extending
the specialization order. Such a total ordering is precisely a [topological
ordering](https://en.wikipedia.org/wiki/Topological_ordering) on the category of
elements of the graph. The particular such order is computed using breadth-first
search, which ensures that edges are close to their sources and targets (while
still always being greater than them).
 */
pub fn spec_order_all<G>(graph: &G) -> Vec<GraphElem<G::V, G::E>>
where
    G: FinGraph,
    G::V: Clone + Hash,
{
    spec_order(graph, graph.vertices())
}

/** Arrange some or all elements of a graph in specialization order.

This function is similar to [`spec_order_all`] except that the breadth-first
search starts only from the given vertices.
 */
pub fn spec_order<G>(graph: &G, vertices: impl Iterator<Item = G::V>) -> Vec<GraphElem<G::V, G::E>>
where
    G: FinGraph,
    G::V: Clone + Hash,
{
    let mut result = Vec::new();
    let mut queue = VecDeque::new();
    let mut visited = HashSet::new();
    for v in vertices {
        if !visited.contains(&v) {
            queue.push_back(v);
        }
        while let Some(v) = queue.pop_front() {
            if visited.contains(&v) {
                continue;
            }
            result.push(GraphElem::Vertex(v.clone()));
            for e in graph.out_edges(&v) {
                let w = graph.tgt(&e);
                if w == v || visited.contains(&w) {
                    // Include loops at v.
                    result.push(GraphElem::Edge(e))
                } else {
                    queue.push_back(w);
                }
            }
            for e in graph.in_edges(&v) {
                let w = graph.src(&e);
                if w == v {
                    // Exclude loops at v.
                    continue;
                }
                if visited.contains(&w) {
                    result.push(GraphElem::Edge(e))
                } else {
                    queue.push_back(w);
                }
            }
            visited.insert(v);
        }
    }
    result
}

/// An element in a graph.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum GraphElem<V, E> {
    /// A vertex in a graph.
    Vertex(V),

    /// An edge in a graph.
    Edge(E),
}

#[cfg(test)]
mod tests {
    use super::GraphElem::*;
    use super::*;

    #[test]
    fn bfs_ordering() {
        let g = SkelGraph::path(3);
        assert_eq!(
            spec_order(&g, Some(0).into_iter()),
            vec![Vertex(0), Vertex(1), Edge(0), Vertex(2), Edge(1)]
        );
        assert_eq!(
            spec_order(&g, Some(2).into_iter()),
            vec![Vertex(2), Vertex(1), Edge(1), Vertex(0), Edge(0)]
        );

        let g = SkelGraph::triangle();
        let desired = vec![Vertex(0), Vertex(1), Edge(0), Vertex(2), Edge(1), Edge(2)];
        assert_eq!(spec_order_all(&g), desired);
        assert_eq!(spec_order(&g, Some(0).into_iter()), desired);

        let g = SkelGraph::self_loop();
        assert_eq!(spec_order_all(&g), vec![Vertex(0), Edge(0)]);
    }
}
