//! Algorithms on graphs.

use std::collections::{HashMap, HashSet, VecDeque};
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

/// Depth-first search over a finite graph.
///
/// Constructed via [`DFSBuilder`]. The `discovered` set is persisted internally,
/// allowing multiple calls to [`traverse`](DFS::traverse) with different start
/// vertices while sharing visited-vertex state.
///
/// The type parameters `D` and `C` are the callback types for `on_discover` and
/// `on_complete`, respectively.
pub struct DFS<'a, G: FinGraph, D, C>
where
    G::V: Hash + 'a,
    D: FnMut(G::V),
    C: FnMut(G::V),
{
    graph: &'a G,
    discovered: HashSet<G::V>,
    traversal_direction: TraversalDirection,
    on_discover: Option<D>,
    on_complete: Option<C>,
}

impl<'a, G: FinGraph, D, C> DFS<'a, G, D, C>
where
    G::V: Hash + 'a,
    D: FnMut(G::V),
    C: FnMut(G::V),
{
    /// Clears the `discovered` set, allowing the DFS to revisit all vertices.
    pub fn reset(&mut self) {
        self.discovered.clear();
    }

    /// Traverses the graph depth-first starting from the given vertex.
    ///
    /// Vertices already in the `discovered` set are skipped, and newly visited
    /// vertices are added to it. This allows multiple calls with different start
    /// vertices to share state.
    ///
    /// # Example
    ///
    /// ```rust,ignore
    /// let mut discover_order = Vec::new();
    /// let mut complete_order = Vec::new();
    /// let mut dfs = DFSBuilder::new(&graph)
    ///     .traversal_direction(TraversalDirection::Outward)
    ///     .on_discover(|v| discover_order.push(v))
    ///     .on_complete(|v| complete_order.push(v))
    ///     .build();
    /// dfs.traverse(start_vertex);
    /// ```
    pub fn traverse(&mut self, start_vertex: G::V) {
        let mut stack = Vec::new();
        stack.push(start_vertex);

        while let Some(nx) = stack.last().cloned() {
            if self.discovered.insert(nx.clone()) {
                if let Some(ref mut callback) = self.on_discover {
                    callback(nx.clone());
                }
                let successors: Vec<_> = match self.traversal_direction {
                    TraversalDirection::Outward => self.graph.out_neighbors(&nx).collect(),
                    TraversalDirection::Inward => self.graph.in_neighbors(&nx).collect(),
                };
                for succ in successors {
                    if !self.discovered.contains(&succ) {
                        stack.push(succ);
                    }
                }
            } else {
                stack.pop();
                if let Some(ref mut callback) = self.on_complete {
                    callback(nx.clone());
                }
            }
        }
    }
}

/// Builder for configuring a [`DFS`] traversal.
///
/// The only required parameter is the graph reference, passed to [`new`](DFSBuilder::new).
/// All other parameters have defaults: outward traversal, empty discovered set,
/// and no callbacks.
pub struct DFSBuilder<'a, G: FinGraph, D, C>
where
    G::V: Hash + 'a,
    D: FnMut(G::V),
    C: FnMut(G::V),
{
    graph: &'a G,
    traversal_direction: Option<TraversalDirection>,
    discovered: Option<HashSet<G::V>>,
    on_discover: Option<D>,
    on_complete: Option<C>,
}

impl<'a, G: FinGraph> DFSBuilder<'a, G, fn(G::V), fn(G::V)>
where
    G::V: Hash + 'a,
{
    /// Creates a new builder for a DFS over the given graph.
    pub fn new(graph: &'a G) -> Self {
        Self {
            graph,
            discovered: None,
            traversal_direction: None,
            on_discover: None,
            on_complete: None,
        }
    }
}

impl<'a, G: FinGraph, D, C> DFSBuilder<'a, G, D, C>
where
    G::V: Hash + 'a,
    D: FnMut(G::V),
    C: FnMut(G::V),
{
    /// Sets the traversal direction (outward or inward along edges).
    /// Defaults to [`TraversalDirection::Outward`].
    pub fn traversal_direction(mut self, dir: TraversalDirection) -> Self {
        self.traversal_direction = Some(dir);
        self
    }

    /// Sets a callback invoked when a vertex is first discovered.
    pub fn on_discover<D2: FnMut(G::V)>(self, on_discover: D2) -> DFSBuilder<'a, G, D2, C> {
        DFSBuilder {
            graph: self.graph,
            traversal_direction: self.traversal_direction,
            discovered: self.discovered,
            on_discover: Some(on_discover),
            on_complete: self.on_complete,
        }
    }

    /// Sets a callback invoked when backtracking from a vertex after all its
    /// neighbors have been processed.
    pub fn on_complete<C2: FnMut(G::V)>(self, on_complete: C2) -> DFSBuilder<'a, G, D, C2> {
        DFSBuilder {
            graph: self.graph,
            traversal_direction: self.traversal_direction,
            discovered: self.discovered,
            on_discover: self.on_discover,
            on_complete: Some(on_complete),
        }
    }

    /// Provides a pre-populated discovered set, useful for resuming a traversal
    /// or excluding specific vertices.
    pub fn discovered(mut self, discovered: HashSet<G::V>) -> Self {
        self.discovered = Some(discovered);
        self
    }

    /// Builds the [`DFS`] instance.
    pub fn build(self) -> DFS<'a, G, D, C> {
        DFS {
            graph: self.graph,
            discovered: self.discovered.unwrap_or_default(),
            traversal_direction: self.traversal_direction.unwrap_or(TraversalDirection::Outward),
            on_discover: self.on_discover,
            on_complete: self.on_complete,
        }
    }
}

/// Computes a topological sorting for a given graph.
///
/// This toposort algorithm was adapted from the crate `petgraph`, found
/// [here](https://github.com/petgraph/petgraph/blob/4d807c19304c02c9dd687c68577f75aefcb98491/src/algo/mod.rs#L204).
pub fn toposort<'a, G>(graph: &'a G) -> Result<Vec<G::V>, String>
where
    G: FinGraph,
    G::V: Hash + std::fmt::Debug + 'a,
{
    let mut finished = HashSet::new();
    let mut finish_stack = Vec::new();

    let mut dfs = DFSBuilder::new(graph)
        .traversal_direction(TraversalDirection::Outward)
        .on_complete(|nx: G::V| {
            if finished.insert(nx.clone()) {
                finish_stack.push(nx);
            }
        })
        .build();

    for v in graph.vertices() {
        if dfs.discovered.contains(&v) {
            continue;
        }
        dfs.traverse(v);
    }
    finish_stack.reverse();

    // Instead of multiple DFSs backwards to validate that we have no cycles, we
    // simply test directly by comparing positions of vertices.
    let position: HashMap<G::V, usize> =
        finish_stack.iter().enumerate().map(|(i, v)| (v.clone(), i)).collect();
    for e in graph.edges() {
        let s = graph.src(&e);
        let t = graph.tgt(&e);
        // Note that we did a DFS starting at every vertex, so it's impossible
        // that they don't appear _somewhere_ in our map.
        if position[&s] >= position[&t] {
            return Err(format!("Cycle detected involving node {:#?}", s));
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
        // Test 1: Simple acyclic graph (path: 0 -> 1 -> 2)
        let g = SkelGraph::path(3);
        let mut discovered_order = Vec::new();
        let mut completed_order = Vec::new();
        let mut dfs = DFSBuilder::new(&g)
            .traversal_direction(TraversalDirection::Outward)
            .on_discover(|v| discovered_order.push(v))
            .on_complete(|v| completed_order.push(v))
            .build();
        dfs.traverse(0);
        // Discover in DFS order from 0: 0, then 1, then 2
        assert_eq!(discovered_order, vec![0, 1, 2]);
        // Complete in reverse order: finish 2, then 1, then 0
        assert_eq!(completed_order, vec![2, 1, 0]);

        // Test 2: Graph with branching (triangle: 0 -> 1 -> 2, 0 -> 2)
        let g = SkelGraph::triangle();
        let mut discovered_order = Vec::new();
        let mut completed_order = Vec::new();
        let mut dfs = DFSBuilder::new(&g)
            .traversal_direction(TraversalDirection::Outward)
            .on_discover(|v| discovered_order.push(v))
            .on_complete(|v| completed_order.push(v))
            .build();
        dfs.traverse(0);
        // Discover all three vertices
        assert_eq!(discovered_order.len(), 3);
        assert_eq!(discovered_order.iter().collect::<HashSet<_>>(), [0, 1, 2].iter().collect());
        // Vertex 0 should complete last (it's the root)
        assert_eq!(completed_order.last(), Some(&0));

        // Test 3: Self-loops are handled gracefully (no error, no infinite loop)
        let mut g: HashGraph<usize, &str> = Default::default();
        g.add_vertices(vec![0, 1]);
        g.add_edge("self", 0, 0);
        g.add_edge("e", 0, 1);
        let mut discovered_order = Vec::new();
        let mut dfs = DFSBuilder::new(&g)
            .traversal_direction(TraversalDirection::Outward)
            .on_discover(|v| discovered_order.push(v))
            .build();
        dfs.traverse(0);
        assert_eq!(discovered_order.iter().collect::<HashSet<_>>(), [0, 1].iter().collect());
    }
}
