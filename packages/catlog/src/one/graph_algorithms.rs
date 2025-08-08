//! Algorithms on graphs.

use std::collections::{HashSet, VecDeque};
use std::hash::Hash;

use super::graph::*;
use super::path::*;

/** Iterates over all simple paths between two vertices of a finite graph.

On our definition, a **simple path** is a path in which all edges are distinct.

A **simple cycle** is a simple path in which the source and target coincide.
This being a category theory library, we do consider the empty/identity path at
a vertex to be a simple cycle.

# References

This function is adapted from previous implementations of the same algorithm:

- [`all_simple_paths`](https://docs.rs/petgraph/latest/petgraph/algo/simple_paths/fn.all_simple_paths.html)
  in [petgraph](https://github.com/petgraph/petgraph)
- [`all_simple_paths`](https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.simple_paths.all_simple_paths.html)
  in [NetworkX](https://networkx.org)
 */
pub fn simple_paths<'a, G>(
    graph: &'a G,
    from: &'a G::V,
    to: &'a G::V,
) -> impl Iterator<Item = Path<G::V, G::E>> + 'a
where
    G: FinGraph,
    G::V: Hash,
    G::E: Hash,
{
    bounded_simple_paths(graph, from, to, None)
}

/** Iterates over all simple paths of bounded length between two vertices.

Works like [`simple_paths`], with the same definition of *simple path*, but the
returned paths are also optionally restricted to those of bounded length. The
**length** of a path is the number of edges in it.
 */
pub fn bounded_simple_paths<'a, G>(
    graph: &'a G,
    from: &'a G::V,
    to: &'a G::V,
    max_length: Option<usize>,
) -> impl Iterator<Item = Path<G::V, G::E>> + 'a
where
    G: FinGraph,
    G::V: Hash,
    G::E: Hash,
{
    // The current path.
    let mut path: Vec<G::E> = Vec::new();
    // The set of edges in the current path.
    // NOTE: This could be combined with `path` as an `IndexedSet`.
    let mut visited: HashSet<G::E> = HashSet::new();
    // Stack of out-edges of each vertex in the current path.
    let mut stack: Vec<Vec<G::E>> = vec![graph.out_edges(from).collect()];

    let maybe_empty_path = if from == to {
        Some(Path::Id(to.clone()))
    } else {
        None
    };

    let nonempty_paths = std::iter::from_fn(move || {
        while let Some(out_edges) = stack.last_mut() {
            let Some(e) = out_edges.pop() else {
                stack.pop();
                if let Some(e) = path.pop() {
                    visited.remove(&e);
                }
                continue;
            };
            if visited.contains(&e) || max_length.is_some_and(|n| path.len() >= n) {
                continue;
            }
            let tgt = graph.tgt(&e);
            path.push(e.clone());
            visited.insert(e);
            stack.push(graph.out_edges(&tgt).collect());
            if tgt == *to {
                let result = Path::collect(path.iter().cloned());
                return Some(result.unwrap());
            }
        }
        None
    });

    maybe_empty_path.into_iter().chain(nonempty_paths)
}

/** Arrange all the elements of a finite graph in specialization order.

The [specialization
order](https://en.wikipedia.org/wiki/Specialization_(pre)order) is the preorder
associated with the [Alexandrov
topology](https://en.wikipedia.org/wiki/Alexandrov_topology) on the graph.
Equivalently, it is the preorder reflection of the category of elements of the
graph. In simple terms, this means that every edge is greater than its source
and its target.

This function computes a total ordering of the elements of the graph that
extends the specialization order. Such a total ordering is precisely a
[topological ordering](https://en.wikipedia.org/wiki/Topological_ordering) on
the category of elements of the graph. The particular ordering is computed using
breadth-first search, which ensures that edges are close to their sources and
targets (while still always being greater than them).
 */
pub fn spec_order_all<G>(graph: &G) -> Vec<GraphElem<G::V, G::E>>
where
    G: FinGraph,
    G::V: Hash,
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
    G::V: Hash,
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

#[cfg(test)]
mod tests {
    use super::GraphElem::*;
    use super::*;
    use nonempty::nonempty;

    #[test]
    fn find_simple_paths() {
        let mut g = SkelGraph::triangle();
        let paths: Vec<_> = simple_paths(&g, &0, &2).collect();
        assert_eq!(paths, vec![Path::single(2), Path::pair(0, 1)]);
        assert_eq!(bounded_simple_paths(&g, &0, &2, None).count(), 2);
        assert_eq!(bounded_simple_paths(&g, &0, &2, Some(2)).count(), 2);
        assert_eq!(bounded_simple_paths(&g, &0, &2, Some(1)).count(), 1);
        assert_eq!(bounded_simple_paths(&g, &0, &2, Some(0)).count(), 0);

        g.add_vertices(2);
        let s = g.add_edge(3, 0);
        let t = g.add_edge(2, 4);
        let paths: Vec<_> = simple_paths(&g, &3, &4).collect();
        assert_eq!(paths, vec![Path::Seq(nonempty![s, 2, t]), Path::Seq(nonempty![s, 0, 1, t])]);

        let g = SkelGraph::cycle(3);
        let paths: Vec<_> = simple_paths(&g, &0, &0).collect();
        assert_eq!(paths, vec![Path::Id(0), Path::Seq(nonempty![0, 1, 2])]);
        let paths: Vec<_> = simple_paths(&g, &0, &2).collect();
        assert_eq!(paths, vec![Path::Seq(nonempty![0, 1])]);

        let mut g: HashGraph<_, _> = Default::default();
        assert!(g.add_vertex('x'));
        assert!(g.add_edge('f', 'x', 'x'));
        assert!(g.add_edge('g', 'x', 'x'));
        let paths: HashSet<_> = simple_paths(&g, &'x', &'x').collect();
        let target = HashSet::from([
            Path::Id('x'),
            Path::Seq(nonempty!['f']),
            Path::Seq(nonempty!['g']),
            Path::Seq(nonempty!['f', 'g']),
            Path::Seq(nonempty!['g', 'f']),
        ]);
        assert_eq!(paths, target);
    }

    #[test]
    fn spec_ordering() {
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

        let g = SkelGraph::cycle(1);
        assert_eq!(spec_order_all(&g), vec![Vertex(0), Edge(0)]);
    }
}

#[cfg(test)]
mod proptesting {

    use super::*;
    use crate::one::graph::proptesting::skel_graph_strategy;
    use proptest::{prop_assert, prop_assert_eq, proptest};

    fn spec_order_valid<G>(spec_order: &[GraphElem<G::V, G::E>], g: &G) -> bool
    where
        G: Graph,
        G::V: Hash,
    {
        let mut vertices_seen = HashSet::<G::V>::new();
        for cur_element in spec_order {
            match cur_element {
                GraphElem::Vertex(v) => {
                    if !g.has_vertex(v) {
                        return false;
                    }
                    vertices_seen.insert(v.clone());
                }
                GraphElem::Edge(e) => {
                    if !g.has_edge(e) {
                        return false;
                    }
                    let (src, tgt) = (g.src(e), g.tgt(e));
                    if !vertices_seen.contains(&src) || !vertices_seen.contains(&tgt) {
                        return false;
                    }
                }
            }
        }
        true
    }

    proptest! {
        #[test]
        fn gen_small_simple_paths(sk in skel_graph_strategy(0usize..=7,2usize..13)) {
            let all_vertices = sk.vertex_set().clone();
            for s in all_vertices {
                let mut found_id = false;
                for simple_path in bounded_simple_paths(&sk, &s, &s, Some(3)) {
                    prop_assert_eq!(simple_path.src(&sk), s);
                    prop_assert_eq!(simple_path.tgt(&sk), s);
                    prop_assert!(simple_path.is_simple());
                    if !found_id && simple_path == Path::Id(s){
                        found_id = true;
                    }
                }
                prop_assert!(found_id);
                for t in all_vertices {
                    if t==s {
                        continue;
                    }
                    for simple_path in bounded_simple_paths(&sk, &s, &t, Some(3)) {
                        prop_assert_eq!(simple_path.src(&sk), s);
                        prop_assert_eq!(simple_path.tgt(&sk), t);
                        prop_assert!(simple_path.is_simple());
                    }
                }
            }
        }

        #[test]
        fn gen_specorder(sk in skel_graph_strategy(0usize..=7,2usize..13)) {
            let my_spec_order = spec_order_all(&sk);
            prop_assert!(spec_order_valid(&my_spec_order,&sk));
        }
    }
}
