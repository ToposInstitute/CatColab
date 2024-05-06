//! Graphs, finite and infinite.

use std::hash::Hash;
use thiserror::Error;

use crate::set::*;
use crate::column::*;

/** A graph.

This is a graph in the category theorist's sense, i.e., it is directed and
admits multiple edges and self loops. Moreover, a graph is not assumed to be
finite, even locally.
 */
pub trait Graph {
    /// Type of vertices in graph.
    type V: Eq;

    /// Type of edges in graph.
    type E: Eq;

    /// Does the graph contain the value as a vertex?
    fn has_vertex(&self, v: &Self::V) -> bool;

    /// Does the graph contain the value as an edge?
    fn has_edge(&self, e: &Self::E) -> bool;

    /// Gets the source of an edge, assumed to be contained in the graph.
    fn src(&self, e: &Self::E) -> Self::V;

    /// Gets the target of an edge, assumed to be contained in the graph.
    fn tgt(&self, e: &Self::E) -> Self::V;
}

/** A graph with finitely many vertices and edges.
 */
pub trait FinGraph: Graph {
    /// Iterates over the vertices in the graph.
    fn vertices(&self) -> impl Iterator<Item = Self::V>;

    /// Iterates over the edges in the graph.
    fn edges(&self) -> impl Iterator<Item = Self::E>;

    /// Iterates over the edges incoming to a vertex.
    fn in_edges(&self, v: &Self::V) -> impl Iterator<Item = Self::E>;

    /// Iterates over the edges outgoing from a vertex.
    fn out_edges(&self, v: &Self::V) -> impl Iterator<Item = Self::E>;

    /// Number of vertices in the graph.
    fn nv(&self) -> usize {
        self.vertices().count()
    }

    /// Number of edges in the graph.
    fn ne(&self) -> usize {
        self.edges().count()
    }
}

/// An invalid assignment in a graph.
#[derive(Error,Debug)]
pub enum GraphInvalid<E> {
    /// Edge with an invalid source.
    #[error("Source of edge `{0}` is not set or not contained in graph")]
    Src(E),

    /// Edge with an invalid target.
    #[error("Target of edge `{0}` is not set or not contained in graph")]
    Tgt(E),
}

/** A finite graph backed by columns.

Such a graph is defined in the styles of "C-sets" by two
[finite sets](crate::set::FinSet) and two [columns](crate::column::Column).
 */
#[derive(Clone,Default)]
pub struct ColumnarGraph<VSet,ESet,Col> {
    vertex_set: VSet,
    edge_set: ESet,
    src_map: Col,
    tgt_map: Col,
}

impl<V,E,VSet,ESet,Col> ColumnarGraph<VSet,ESet,Col>
where V: Eq, E: Eq,
      VSet: Set<Elem=V>, ESet: Set<Elem=E>, Col: Mapping<Dom=E,Cod=V> {
    /// Gets the source of an edge, possibly undefined.
    pub fn get_src(&self, e: &E) -> Option<&V> { self.src_map.apply(e) }

    /// Gets the target of an edge, possibly undefined.
    pub fn get_tgt(&self, e: &E) -> Option<&V> { self.tgt_map.apply(e) }

    /// Sets the source of an edge.
    pub fn set_src(&mut self, e: E, v: V) -> Option<V> { self.src_map.set(e,v) }

    /// Sets the target of an edge.
    pub fn set_tgt(&mut self, e: E, v: V) -> Option<V> { self.tgt_map.set(e,v) }
}

impl<V,E,VSet,ESet,Col> ColumnarGraph<VSet,ESet,Col>
where V: Eq + Clone, E: Eq + Clone,
      VSet: FinSet<Elem=V>, ESet: FinSet<Elem=E>, Col: Column<Dom=E,Cod=V> {
    /// Validates that the graph is well defined.
    pub fn validate(&self) -> Result<(), Vec<GraphInvalid<E>>> {
        let errors: Vec<_> = self.iter_invalid().collect();
        if errors.is_empty() { Ok(()) } else { Err(errors) }
    }

    /// Iterates over invalid assignments in the graph.
    pub fn iter_invalid<'a>(&'a self) -> impl Iterator<Item = GraphInvalid<E>> + 'a {
        let (dom, cod) = (&self.edge_set, &self.vertex_set);
        let srcs = self.src_map.iter_not_functional(dom, cod).map(
            |e| GraphInvalid::Src(e.take()));
        let tgts = self.tgt_map.iter_not_functional(dom, cod).map(
            |e| GraphInvalid::Tgt(e.take()));
        srcs.chain(tgts)
    }
}

impl<V,E,VSet,ESet,Col> Graph for ColumnarGraph<VSet,ESet,Col>
where V: Eq + Clone, E: Eq + Clone,
      VSet: Set<Elem=V>, ESet: Set<Elem=E>, Col: Mapping<Dom=E,Cod=V> {
    type V = V;
    type E = E;

    fn has_vertex(&self, v: &V) -> bool {
        self.vertex_set.contains(v)
    }
    fn has_edge(&self, e: &E) -> bool {
        self.edge_set.contains(e)
    }
    fn src(&self, e: &E) -> V {
        self.get_src(e).expect("Source of edge should be set").clone()
    }
    fn tgt(&self, e: &E) -> V {
        self.get_tgt(e).expect("Target of edge should be set").clone()
    }
}

impl<V,E,VSet,ESet,Col> FinGraph for ColumnarGraph<VSet,ESet,Col>
where V: Eq + Clone, E: Eq + Clone,
      VSet: FinSet<Elem=V>, ESet: FinSet<Elem=E>, Col: Column<Dom=E,Cod=V> {
    fn vertices(&self) -> impl Iterator<Item = V> {
        self.vertex_set.iter()
    }
    fn edges(&self) -> impl Iterator<Item = E> {
        self.edge_set.iter()
    }
    fn in_edges(&self, v: &V) -> impl Iterator<Item = E> {
        self.tgt_map.preimage(v)
    }
    fn out_edges(&self, v: &V) -> impl Iterator<Item = E> {
        self.src_map.preimage(v)
    }
    fn nv(&self) -> usize { self.vertex_set.len() }
    fn ne(&self) -> usize { self.edge_set.len() }
}

impl<Col> ColumnarGraph<SkelFinSet,SkelFinSet,Col>
where Col: Column<Dom=usize, Cod=usize> {
    /// Adds a new vertex to the graph and returns it.
    pub fn add_vertex(&mut self) -> usize {
        self.vertex_set.insert()
    }

    /// Adds `n` new vertices to the graphs and returns them.
    pub fn add_vertices(&mut self, n: usize) -> std::ops::Range<usize> {
        self.vertex_set.extend(n)
    }

    /// Adds a new edge to the graph and returns it.
    pub fn add_edge(&mut self, src: usize, tgt: usize) -> usize {
        let e = self.edge_set.insert();
        self.set_src(e, src);
        self.set_tgt(e, tgt);
        e
    }

    /// Makes a path graph of length `n`.
    #[cfg(test)]
    pub fn path(n: usize) -> Self where Col: Default {
        let mut g: Self = Default::default();
        g.add_vertices(n);
        for (i, j) in std::iter::zip(0..(n-1), 1..n) {
            g.add_edge(i, j);
        }
        g
    }

    /// Makes a triangle graph (2-simplex).
    #[cfg(test)]
    pub fn triangle() -> Self where Col: Default {
        let mut g: Self = Default::default();
        g.add_vertices(3);
        g.add_edge(0,1); g.add_edge(1,2); g.add_edge(0,2);
        g
    }
}

impl<V,E,Col> ColumnarGraph<HashFinSet<V>,HashFinSet<E>,Col>
where V: Eq+Hash+Clone, E: Eq+Hash+Clone, Col: Column<Dom=E, Cod=V> {
    /// Adds a vertex to the graph, returning whether the vertex is new.
    pub fn add_vertex(&mut self, v: V) -> bool {
        self.vertex_set.insert(v)
    }

    /// Adds multiple vertices to the graph.
    pub fn add_vertices<T>(&mut self, iter: T) where T: IntoIterator<Item = V> {
        self.vertex_set.extend(iter)
    }

    /** Adds an edge to the graph, returning whether the edge is new.

    If the edge is not new, it source and target are updated.
    */
    pub fn add_edge(&mut self, e: E, src: V, tgt: V) -> bool {
        self.set_src(e.clone(), src);
        self.set_tgt(e.clone(), tgt);
        self.edge_set.insert(e)
    }
}

/** A skeletal finite graph with indexed source and target maps.

The data structure is the same as the standard `Graph` type in
[Catlab.jl](https://github.com/AlgebraicJulia/Catlab.jl).
 */
pub type SkelFinGraph = ColumnarGraph<SkelFinSet,SkelFinSet,SkelIndexedColumn>;

/** A finite graph with indexed source and target maps, based on hash maps.

Unlike in a skeletal finite graph, the vertices and edges can have arbitrary
hashable types.
*/
pub type HashFinGraph<V,E> =
    ColumnarGraph<HashFinSet<V>, HashFinSet<E>, IndexedHashColumn<E,V>>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skel_fin_graph() {
        let g = SkelFinGraph::triangle();
        assert_eq!(g.nv(), 3);
        assert_eq!(g.ne(), 3);
        assert_eq!(g.src(&1), 1);
        assert_eq!(g.tgt(&1), 2);
        assert_eq!(g.out_edges(&0).collect::<Vec<_>>(), vec![0,2]);
        assert_eq!(g.in_edges(&2).collect::<Vec<_>>(), vec![1,2]);
    }

    #[test]
    fn hash_fin_graph() {
        let mut g: HashFinGraph<char,&str> = Default::default();
        assert!(g.add_vertex('x'));
        g.add_vertices(['y', 'z'].into_iter());
        assert!(g.add_edge("f", 'x', 'y'));
        assert!(g.add_edge("g", 'y', 'z'));
        assert!(g.add_edge("fg", 'x', 'z'));
        assert_eq!(g.src(&"fg"), 'x');
        assert_eq!(g.tgt(&"fg"), 'z');
    }

    #[test]
    fn validate_columnar_graph() {
        let mut g = SkelFinGraph::triangle();
        assert!(g.validate().is_ok());
        g.set_src(2, 3); // Vertex 3 doesn't exist yet.
        assert!(g.validate().is_err());
        assert_eq!(g.add_vertex(), 3); // OK, now it does!
        assert!(g.validate().is_ok());
    }
}
