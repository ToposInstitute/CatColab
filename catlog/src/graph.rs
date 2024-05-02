//! Graphs, finite and infinite.

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
    fn src<'a>(&'a self, e: &'a Self::E) -> &Self::V;

    /// Gets the target of an edge, assumed to be contained in the graph.
    fn tgt<'a>(&'a self, e: &'a Self::E) -> &Self::V;
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
where V: Eq, E: Eq, VSet: FinSet<Elem=V>, ESet: FinSet<Elem=E>, Col: Column<Dom=E,Cod=V> {
    /// Gets the source of an edge, possibly undefined.
    pub fn get_src(&self, e: &E) -> Option<&V> { self.src_map.apply(e) }

    /// Gets the target of an edge, possibly undefined.
    pub fn get_tgt(&self, e: &E) -> Option<&V> { self.tgt_map.apply(e) }

    /// Sets the source of an edge.
    pub fn set_src(&mut self, e: E, v: V) -> Option<V> { self.src_map.set(e,v) }

    /// Sets the target of an edge.
    pub fn set_tgt(&mut self, e: E, v: V) -> Option<V> { self.tgt_map.set(e,v) }
}

impl<V,E,VSet,ESet,Col> Graph for ColumnarGraph<VSet,ESet,Col>
where V: Eq, E: Eq, VSet: FinSet<Elem=V>, ESet: FinSet<Elem=E>, Col: Column<Dom=E,Cod=V> {
    type V = V;
    type E = E;

    fn has_vertex(&self, v: &V) -> bool {
        self.vertex_set.contains(v)
    }
    fn has_edge(&self, e: &E) -> bool {
        self.edge_set.contains(e)
    }
    fn src(&self, e: &E) -> &V {
        self.get_src(e).expect("Source of edge should be defined")
    }
    fn tgt(&self, e: &E) -> &V {
        self.get_tgt(e).expect("Target of edge should be defined")
    }
}

impl<V,E,VSet,ESet,Col> FinGraph for ColumnarGraph<VSet,ESet,Col>
where V: Eq, E: Eq, VSet: FinSet<Elem=V>, ESet: FinSet<Elem=E>, Col: Column<Dom=E,Cod=V> {
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

/** A skeletal finite graph with indexed source and target maps.
 */
pub type SkelFinGraph = ColumnarGraph<SkelFinSet,SkelFinSet,SkelIndexedColumn>;

impl<Col> ColumnarGraph<SkelFinSet,SkelFinSet,Col>
where Col: Column<Dom=usize, Cod=usize> {
    /// Adds and returns a new vertex.
    pub fn add_vertex(&mut self) -> usize {
        self.vertex_set.insert()
    }

    /// Adds and returns `n` new vertices.
    pub fn add_vertices(&mut self, n: usize) -> std::ops::Range<usize> {
        self.vertex_set.extend(n)
    }

    /// Adds and returns a new edge.
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
        g.add_vertex(); g.add_vertex(); g.add_vertex();
        g.add_edge(0,1); g.add_edge(1,2); g.add_edge(0,2);
        g
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skel_fin_graph() {
        let g = SkelFinGraph::triangle();
        assert_eq!(g.nv(), 3);
        assert_eq!(g.ne(), 3);
        assert_eq!(*g.src(&1), 1);
        assert_eq!(*g.tgt(&1), 2);
        assert_eq!(g.out_edges(&0).collect::<Vec<_>>(), vec![0,2]);
        assert_eq!(g.in_edges(&2).collect::<Vec<_>>(), vec![1,2]);
    }
}
