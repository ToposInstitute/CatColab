/*! Paths in graphs and categories.

The central data type is [`Path`]. In addition, this module provides a simple
data type for [path equations](`PathEq`).
*/

use either::Either;
use nonempty::{NonEmpty, nonempty};
use std::fmt::Debug;
use std::ops::Range;
use std::{collections::HashSet, hash::Hash};

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
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
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

/// Converts an edge into a path of length one.
impl<V, E> From<E> for Path<V, E> {
    fn from(e: E) -> Self {
        Path::single(e)
    }
}

/// Converts the path into an iterater over its edges.
impl<V, E> IntoIterator for Path<V, E> {
    type Item = E;
    type IntoIter = Either<std::iter::Empty<E>, <NonEmpty<E> as IntoIterator>::IntoIter>;

    fn into_iter(self) -> Self::IntoIter {
        match self {
            Path::Id(_) => Either::Left(std::iter::empty()),
            Path::Seq(edges) => Either::Right(edges.into_iter()),
        }
    }
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

    /** Constructs a path from an iterator over edges.

    Returns `None` if the iterator is empty.
     */
    pub fn collect<I>(iter: I) -> Option<Self>
    where
        I: IntoIterator<Item = E>,
    {
        NonEmpty::collect(iter).map(Path::Seq)
    }

    /** Constructs a path from a vector of edges.

    Returns `None` if the vector is empty.
     */
    pub fn from_vec(vec: Vec<E>) -> Option<Self> {
        NonEmpty::from_vec(vec).map(Path::Seq)
    }

    /** Constructs a path by repeating an edge `n` times.

    The edge should have the same source and target, namely the first argument.
     */
    pub fn repeat_n(v: V, e: E, n: usize) -> Self
    where
        E: Clone,
    {
        Path::collect(std::iter::repeat_n(e, n)).unwrap_or_else(|| Path::empty(v))
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

    /** Iterates over edges in the path, if any.

    This method is a one-sided inverse to [`Path::collect`].
     */
    pub fn iter(&self) -> impl Iterator<Item = &E> {
        match self {
            Path::Id(_) => Either::Left(std::iter::empty()),
            Path::Seq(edges) => Either::Right(edges.iter()),
        }
    }

    /** Returns the unique edge in a path of length 1.

    This method is a one-sided inverse to [`Path::single`].
     */
    pub fn only(self) -> Option<E> {
        match self {
            Path::Id(_) => None,
            Path::Seq(edges) => {
                if edges.tail.is_empty() {
                    Some(edges.head)
                } else {
                    None
                }
            }
        }
    }

    /// Inserts an edge into the path at the given index.
    pub fn insert(&mut self, index: usize, edge: E) {
        if let Path::Seq(edges) = self {
            edges.insert(index, edge);
        } else {
            *self = Path::single(edge);
        }
    }

    /// Splices a path into another path at the given range of indices.
    pub fn spliced(self, range: Range<usize>, replace_with: Self) -> Self {
        let new_path = if range.start == 0 && range.end == self.len() + 1 {
            Some(replace_with)
        } else if let Path::Seq(edges) = self {
            let mut edges: Vec<_> = edges.into_iter().collect();
            edges.splice(range, replace_with);
            Path::from_vec(edges)
        } else {
            None
        };
        new_path.expect("Range of indices into path should be valid")
    }

    /** Source of the path in the given graph.

    Assumes that the path is [contained in](Path::contained_in) the graph.
    */
    pub fn src(&self, graph: &impl Graph<V = V, E = E>) -> V
    where
        V: Clone,
    {
        match self {
            Path::Id(v) => v.clone(),
            Path::Seq(edges) => graph.src(edges.first()),
        }
    }

    /** Target of the path in the given graph.

    Assumes that the path is [contained in](Path::contained_in) the graph.
    */
    pub fn tgt(&self, graph: &impl Graph<V = V, E = E>) -> V
    where
        V: Clone,
    {
        match self {
            Path::Id(v) => v.clone(),
            Path::Seq(edges) => graph.tgt(edges.last()),
        }
    }

    /** Extracts a subpath of a path in a graph.

    Panics if the range is invalid or an empty subpath would be inconsistent.
     */
    pub fn subpath(&self, graph: &impl Graph<V = V, E = E>, range: Range<usize>) -> Self
    where
        V: Eq + Clone + Debug,
        E: Clone,
    {
        if let Path::Seq(edges) = self {
            if range.is_empty() {
                let index = range.start;
                let v = if index == 0 {
                    graph.src(edges.first())
                } else if index == edges.len() {
                    graph.tgt(edges.last())
                } else if index < edges.len() {
                    let (t, s) = (graph.tgt(&(*edges)[index - 1]), graph.src(&(*edges)[index]));
                    assert_eq!(t, s, "Inconsistent intermediate vertex in path");
                    t
                } else {
                    panic!("Invalid index for empty subpath of path");
                };
                Path::Id(v)
            } else {
                let (start, end) = (range.start, range.end);
                let iter = if start == 0 {
                    let head = std::iter::once(edges.head.clone());
                    let tail = edges.tail[0..(end - 1)].iter().cloned();
                    Either::Left(head.chain(tail))
                } else {
                    Either::Right(edges.tail[(start - 1)..(end - 1)].iter().cloned())
                };
                Path::collect(iter).unwrap()
            }
        } else {
            assert!(range.start == 0 && range.is_empty(), "Invalid subpath of empty path");
            self.clone()
        }
    }

    /** Concatenates this path with another path in the graph.

    This methods *checks* that the two paths are compatible (the target of this
    path equals the source of the other path) and it *assumes* that both paths
    are contained in the graph, which should be checked with
    [`contained_in`](Self::contained_in) if in doubt. Thus, when returned, the
    concatenated path is also a valid path.
     */
    pub fn concat_in(self, graph: &impl Graph<V = V, E = E>, other: Self) -> Option<Self>
    where
        V: Eq + Clone,
    {
        if self.tgt(graph) != other.src(graph) {
            return None;
        }
        let concatenated = match (self, other) {
            (path, Path::Id(_)) => path,
            (Path::Id(_), path) => path,
            (Path::Seq(mut edges), Path::Seq(mut other_edges)) => {
                edges.push(other_edges.head);
                edges.append(&mut other_edges.tail);
                Path::Seq(edges)
            }
        };
        Some(concatenated)
    }

    /// Is the path contained in the given graph?
    pub fn contained_in(&self, graph: &impl Graph<V = V, E = E>) -> bool
    where
        V: Eq,
    {
        match self {
            Path::Id(v) => graph.has_vertex(v),
            Path::Seq(edges) => {
                // All the edges exist in the graph...
                edges.iter().all(|e| graph.has_edge(e)) &&
                // ...and their sources and target are compatible.
                std::iter::zip(edges.iter(), edges.iter().skip(1)).all(
                    |(e,f)| graph.tgt(e) == graph.src(f))
            }
        }
    }

    /** Returns whether the path is simple.

    On our definition, a path is **simple** if it has no repeated edges.
     */
    pub fn is_simple(&self) -> bool
    where
        E: Eq + Hash,
    {
        match self {
            Path::Id(_) => true,
            Path::Seq(edges) => {
                let edges: HashSet<_> = edges.into_iter().collect();
                edges.len() == self.len()
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
    /** Flattens a path of paths into a single path.

    Unlike [`flatten_in`](Self::flatten_in), this method does not check that the
    composite is well typed before computing it.
     */
    pub fn flatten(self) -> Path<V, E> {
        match self {
            Path::Id(x) => Path::Id(x),
            Path::Seq(paths) => {
                if paths.iter().any(|p| matches!(p, Path::Seq(_))) {
                    // We either have at least one non-empty sequence...
                    let edges = paths
                        .into_iter()
                        .filter_map(|p| match p {
                            Path::Id(_) => None,
                            Path::Seq(edges) => Some(edges),
                        })
                        .flatten();
                    Path::Seq(NonEmpty::collect(edges).unwrap())
                } else {
                    // ...or else every path is an identity.
                    paths.head
                }
            }
        }
    }

    /** Flattens a path of paths in a graph into a single path.

    Returns the flattened path just when the original paths have compatible
    start and end points.
     */
    pub fn flatten_in(self, graph: &impl Graph<V = V, E = E>) -> Option<Path<V, E>>
    where
        V: Eq + Clone,
    {
        if let Path::Seq(paths) = &self {
            let mut pairs = std::iter::zip(paths.iter(), paths.iter().skip(1));
            if !pairs.all(|(p1, p2)| p1.tgt(graph) == p2.src(graph)) {
                return None;
            }
        }
        Some(self.flatten())
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

    Panics if the two sides of the path equation have different sources.
    */
    pub fn src(&self, graph: &impl Graph<V = V, E = E>) -> V
    where
        V: Eq + Clone + Debug,
    {
        let (x, y) = (self.lhs.src(graph), self.rhs.src(graph));
        assert_eq!(x, y, "Both sides of path equation should have same source");
        x
    }

    /** Target of the path equation in the given graph.

    Panics if the two sides of the path equation have different targets.
    */
    pub fn tgt(&self, graph: &impl Graph<V = V, E = E>) -> V
    where
        V: Eq + Clone + Debug,
    {
        let (x, y) = (self.lhs.tgt(graph), self.rhs.tgt(graph));
        assert_eq!(x, y, "Both sides of path equation should have same target");
        x
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
    pub fn iter_invalid_in<G>(
        &self,
        graph: &G,
    ) -> impl Iterator<Item = InvalidPathEq> + use<G, V, E>
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
        let path = Path::pair(0, 1);
        assert_eq!(path.src(&g), 0);
        assert_eq!(path.tgt(&g), 2);
        assert_eq!(Path::single(0).concat_in(&g, Path::single(1)), Some(path));

        assert!(Path::Id(2).contained_in(&g));
        assert!(!Path::Id(3).contained_in(&g));
        assert!(Path::pair(0, 1).contained_in(&g));
        assert!(!Path::pair(1, 0).contained_in(&g));
    }

    #[test]
    fn singleton_path() {
        let e = 1;
        assert_eq!(SkelPath::single(e).only(), Some(e));
    }

    #[test]
    fn insert_into_path() {
        let mut path = SkelPath::Id(0);
        path.insert(0, 2);
        assert_eq!(path, Path::single(2));
        path.insert(0, 1);
        assert_eq!(path, Path::pair(1, 2));

        assert_eq!(SkelPath::empty(0).spliced(0..1, Path::pair(0, 1)), Path::pair(0, 1));
        assert_eq!(SkelPath::empty(0).spliced(0..1, Path::empty(0)), Path::empty(0));
        let target = SkelPath::Seq(nonempty![0, 1, 2]);
        assert_eq!(Path::pair(0, 2).spliced(1..1, Path::single(1)), target);
        assert_eq!(Path::pair(0, 2).spliced(1..2, Path::pair(1, 2)), target);
        assert_eq!(target.clone().spliced(1..3, Path::pair(1, 2)), target);
        assert_eq!(target.clone().spliced(1..1, Path::empty(0)), target);
    }

    #[test]
    fn subpath() {
        let g = SkelGraph::path(4);
        assert_eq!(Path::Id(1).subpath(&g, 0..0), Path::Id(1));
        let path = Path::Seq(nonempty![0, 1, 2]);
        assert_eq!(path.subpath(&g, 0..0), Path::Id(0));
        assert_eq!(path.subpath(&g, 1..1), Path::Id(1));
        assert_eq!(path.subpath(&g, 3..3), Path::Id(3));
        assert_eq!(path.subpath(&g, 0..2), Path::pair(0, 1));
        assert_eq!(path.subpath(&g, 1..3), Path::pair(1, 2));
    }

    #[test]
    fn map_path() {
        let id = SkelPath::Id(1);
        assert_eq!(id.iter().count(), 0);
        assert_eq!(id.clone().into_iter().count(), 0);
        assert_eq!(id.clone().map(|v| v + 1, identity), Path::Id(2));
        assert_eq!(id.partial_map(|v| Some(v + 1), Some), Some(Path::Id(2)));

        let pair = SkelPath::pair(0, 1);
        assert_eq!(pair.iter().count(), 2);
        assert_eq!(pair.clone().into_iter().count(), 2);
        assert_eq!(pair.clone().map(identity, |e| e + 1), Path::pair(1, 2));
        assert_eq!(pair.partial_map(Some, |e| Some(e + 1)), Some(Path::pair(1, 2)));
    }

    #[test]
    fn path_eq() {
        let g = SkelGraph::triangle();
        let eq = PathEq::new(Path::pair(0, 1), Path::single(2));
        assert_eq!(eq.src(&g), 0);
        assert_eq!(eq.tgt(&g), 2);
        assert!(eq.validate_in(&g).is_ok());
    }

    #[test]
    fn path_is_simple() {
        assert!(SkelPath::pair(0, 1).is_simple());
        assert!(!SkelPath::pair(0, 0).is_simple());
        assert!(SkelPath::Id(0).is_simple());
    }
}
