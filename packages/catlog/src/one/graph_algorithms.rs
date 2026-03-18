//! Algorithms on graphs.

use std::collections::{HashSet, VecDeque};
use std::hash::Hash;

use super::graph::*;
use super::path::*;

/// Iterates over all simple paths between two vertices of a finite graph.
///
/// On our definition, a **simple path** is a path in which all edges are distinct.
///
/// A **simple cycle** is a simple path in which the source and target coincide.
/// This being a category theory library, we do consider the empty/identity path at
/// a vertex to be a simple cycle.
///
/// # References
///
/// This function is adapted from previous implementations of the same algorithm:
///
/// - [`all_simple_paths`](https://docs.rs/petgraph/latest/petgraph/algo/simple_paths/fn.all_simple_paths.html)
///   in [petgraph](https://github.com/petgraph/petgraph)
/// - [`all_simple_paths`](https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.simple_paths.all_simple_paths.html)
///   in [NetworkX](https://networkx.org)
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

/// Iterates over all simple paths of bounded length between two vertices.
///
/// Works like [`simple_paths`], with the same definition of *simple path*, but the
/// returned paths are also optionally restricted to those of bounded length. The
/// length** of a path is the number of edges in it.
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

/// Arrange all the elements of a finite graph in specialization order.
///
/// The [specialization
/// order](https://en.wikipedia.org/wiki/Specialization_(pre)order) is the preorder
/// associated with the [Alexandrov
/// topology](https://en.wikipedia.org/wiki/Alexandrov_topology) on the graph.
/// Equivalently, it is the preorder reflection of the category of elements of the
/// graph. In simple terms, this means that every edge is greater than its source
/// and its target.
///
/// This function computes a total ordering of the elements of the graph that
/// extends the specialization order. Such a total ordering is precisely a
/// [topological ordering](https://en.wikipedia.org/wiki/Topological_ordering) on
/// the category of elements of the graph. The particular ordering is computed using
/// breadth-first search, which ensures that edges are close to their sources and
/// targets (while still always being greater than them).
pub fn spec_order_all<G>(graph: &G) -> Vec<GraphElem<G::V, G::E>>
where
    G: FinGraph,
    G::V: Hash,
{
    spec_order(graph, graph.vertices())
}

/// Arrange some or all elements of a graph in specialization order.
///
/// This function is similar to [`spec_order_all`] except that the breadth-first
/// search starts only from the given vertices.
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

/// An enum which parameterises the traversal direction for the depth first
/// traversal function.
pub enum TraversalDirection {
    /// Visit out_neighbors for each vertex.
    Outward,
    /// Visit in_neighbors for each vertex.
    Inward,
}

/// Perform a depth-first traversal of a graph with optional callbacks.
///
/// This function traverses the graph starting from the given vertex, using the
/// provided `discovered` set to track visited vertices. The traversal direction
/// (with respect to edge orientation) can be specified, see the
/// TraversalDirection enum.
///
/// The `on_discover` callback is invoked when a vertex is first discovered during the
/// traversal, while the `on_complete` callback is invoked when backtracking from a vertex
/// after processing all its in-/out-bound neighbors.
///
/// # Usage
///
/// For a standalone DFS, set `discovered` to an empty set and provide an
/// `on_discover` callback that collects vertices:
///
/// ```rust,ignore
/// let mut discovered = HashSet::new();
/// let mut stack = Vec::new();
/// let mut dfs_order = Vec::new();
/// depth_first_traversal_with_callbacks(
///     graph,
///     start_vertex,
///     &mut discovered,
///     TraversalDirection::Outward,
///     None::<fn(G::V)>,
///     Some(|v| dfs_order.push(v)),
/// )?;
/// // dfs_order now contains vertices in DFS discovery order
/// ```
///
/// `discovered` may be persisted across calls to prevent visiting nodes.
pub fn depth_first_traversal<G: FinGraph, F1, F2>(
    graph: &G,
    start_vertex: G::V,
    discovered: &mut HashSet<G::V>,
    traversal_direction: TraversalDirection,
    mut on_complete: Option<F1>,
    mut on_discover: Option<F2>,
) -> Result<(), String>
where
    G::V: Hash + std::fmt::Debug,
    F1: FnMut(G::V),
    F2: FnMut(G::V),
{
    let mut stack = Vec::new();
    stack.push(start_vertex);

    while let Some(nx) = stack.last().cloned() {
        if discovered.insert(nx.clone()) {
            if let Some(ref mut callback) = on_discover {
                callback(nx.clone());
            }
            let successors: Vec<_> = match traversal_direction {
                TraversalDirection::Outward => graph.out_neighbors(&nx).collect(),
                TraversalDirection::Inward => graph.in_neighbors(&nx).collect(),
            };
            for succ in successors {
                if succ == nx {
                    return Err(format!("Self loop at node {:#?}", nx));
                }
                if !discovered.contains(&succ) {
                    stack.push(succ);
                }
            }
        } else {
            stack.pop();
            if let Some(ref mut callback) = on_complete {
                callback(nx.clone());
            }
        }
    }

    Ok(())
}

/// Computes a topological sorting for a given graph.
///
/// This toposort algorithm was borrowed from the crate `petgraph`, found
/// [here](https://github.com/petgraph/petgraph/blob/4d807c19304c02c9dd687c68577f75aefcb98491/src/algo/mod.rs#L204).
pub fn toposort<G>(graph: &G) -> Result<Vec<G::V>, String>
where
    G: FinGraph,
    G::V: Hash + std::fmt::Debug,
{
    let mut discovered = HashSet::new();
    let mut finished = HashSet::new();
    let mut finish_stack = Vec::new();

    for v in graph.vertices() {
        if discovered.contains(&v) {
            continue;
        }
        depth_first_traversal(
            graph,
            v,
            &mut discovered,
            TraversalDirection::Outward,
            Some(|nx: G::V| {
                if finished.insert(nx.clone()) {
                    finish_stack.push(nx);
                }
            }),
            None::<fn(G::V)>,
        )?;
    }
    finish_stack.reverse();

    discovered.clear();
    for i in finish_stack.iter() {
        let mut first_node: Option<G::V> = None;
        let mut cycle_node: Option<G::V> = None;
        depth_first_traversal(
            graph,
            i.clone(),
            &mut discovered,
            TraversalDirection::Inward,
            None::<fn(G::V)>,
            Some(|nx: G::V| {
                if first_node.is_none() {
                    first_node = Some(nx);
                } else if cycle_node.is_none() {
                    cycle_node = Some(nx);
                }
            }),
        )?;
        if let Some(cycle_node) = cycle_node {
            return Err(format!("Cycle detected involving node {:#?}", cycle_node).to_owned());
        }
    }

    Ok(finish_stack)
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
    fn toposorting() {
        let g = SkelGraph::path(5);
        assert_eq!(toposort(&g), Ok(vec![0, 1, 2, 3, 4]));

        let mut g = SkelGraph::path(3);
        g.add_vertices(1);
        g.add_edge(2, 3);
        g.add_edge(3, 0);
        expect_test::expect!["Cycle detected involving node 3"]
            .assert_eq(&toposort(&g).unwrap_err());

        let g = SkelGraph::triangle();
        assert_eq!(toposort(&g), Ok(vec![0, 1, 2]));

        let mut g = SkelGraph::path(4);
        g.add_vertices(2);
        g.add_edge(1, 4);
        g.add_edge(4, 3);
        g.add_edge(5, 2);
        assert_eq!(toposort(&g), Ok(vec![5, 0, 1, 2, 4, 3]));

        let mut g: HashGraph<_, _> = Default::default();
        g.add_vertices(vec![0, 1, 2, 3, 4, 5]);
        g.add_edge("0-1", 0, 1);
        g.add_edge("1-2", 1, 2);
        g.add_edge("2-3", 2, 3);
        g.add_edge("1-4", 1, 4);
        g.add_edge("4-3", 4, 3);
        g.add_edge("5-2", 5, 2);
        let sort = toposort(&g).unwrap();
        let (i0, i1) = (sort.iter().position(|&x| x == 5), sort.iter().position(|&x| x == 2));
        assert!(i0.unwrap() < i1.unwrap());
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

    #[test]
    fn dfs_with_callbacks() {
        // Test 1: Simple acyclic graph (path of length 3: 0 -> 1 -> 2)
        let g = SkelGraph::path(3);
        let mut discovered_order = Vec::new();
        let mut completed_order = Vec::new();
        let mut discovered = HashSet::new();
        depth_first_traversal(
            &g,
            0,
            &mut discovered,
            TraversalDirection::Outward,
            Some(|v| completed_order.push(v)),
            Some(|v| discovered_order.push(v)),
        )
        .unwrap();
        // Discover in DFS order from 0: discover 0, then 1, then 2
        assert_eq!(discovered_order, vec![0, 1, 2]);
        // Complete in reverse order: finish 2, then 1, then 0
        assert_eq!(completed_order, vec![2, 1, 0]);

        // Test 2: Graph with branching (triangle: 0 -> 1 -> 2, 0 -> 2)
        let g = SkelGraph::triangle();
        let mut discovered_order = Vec::new();
        let mut completed_order = Vec::new();
        let mut discovered = HashSet::new();
        depth_first_traversal(
            &g,
            0,
            &mut discovered,
            TraversalDirection::Outward,
            Some(|v| completed_order.push(v)),
            Some(|v| discovered_order.push(v)),
        )
        .unwrap();
        // Discover all three vertices
        assert_eq!(discovered_order.len(), 3);
        assert_eq!(discovered_order.iter().collect::<HashSet<_>>(), [0, 1, 2].iter().collect());
        // Vertex 0 should complete last (it's the root)
        assert_eq!(completed_order.last(), Some(&0));

        // Test 3: Self-loop detection
        let mut g: HashGraph<usize, &str> = Default::default();
        g.add_vertices(vec![0, 1]);
        g.add_edge("self", 0, 0);
        let mut discovered = HashSet::new();
        let result = depth_first_traversal(
            &g,
            0,
            &mut discovered,
            TraversalDirection::Outward,
            None::<fn(usize)>,
            None::<fn(usize)>,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Self loop"));
    }
}
