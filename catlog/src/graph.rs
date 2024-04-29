use crate::set::*;
use crate::mapping::*;

/** A graph.

This is a graph in the category theorist's sense, i.e., it is directed and
admits multiple edges and self loops. Graphs are not assumed to be finite, even
locally.
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
    fn vertices(&self) -> impl ExactSizeIterator<Item = Self::V>;

    /// Iterates over the edges in the graph.
    fn edges(&self) -> impl ExactSizeIterator<Item = Self::E>;

    /// Iterates over the edges incoming to a vertex.
    fn inedges(&self, v: &Self::V) -> impl Iterator<Item = Self::E>;

    /// Iterates over the edges outgoing from a vertex.
    fn outedges(&self, v: &Self::V) -> impl Iterator<Item = Self::E>;

    /// Number of vertices in the graph.
    fn nv(&self) -> usize {
        self.vertices().len()
    }

    /// Number of edges in the graph.
    fn ne(&self) -> usize {
        self.edges().len()
    }

    /// Iterates over in-neighbors to a vertex, possibly with duplicates.
    fn inneighbors(&self, v: &Self::V) -> impl Iterator<Item = Self::V> {
        self.inedges(v).map(|e| self.src(&e))
    }

    /// Iterates over out-neighbors to a vertex, possibly with duplicates.
    fn outneighbors(&self, v: &Self::V) -> impl Iterator<Item = Self::V> {
        self.outedges(v).map(|e| self.tgt(&e))
    }
}

pub trait MapBasedFinGraph {
    type V: Eq + Clone;
    type E: Eq + Clone;
    type VSet: FinSet<Elem = Self::V>;
    type ESet: FinSet<Elem = Self::E>;
    type Map: Mapping<Dom = Self::E, Cod = Self::V>;

    fn vertex_set(&self) -> &Self::VSet;
    fn edge_set(&self) -> &Self::ESet;

    fn src_map(&self) -> &Self::Map;
    fn tgt_map(&self) -> &Self::Map;
}

// FIXME: Shouldn't be using a blanket implementation.
impl<G: MapBasedFinGraph> Graph for G {
    type V = <G as MapBasedFinGraph>::V;
    type E = <G as MapBasedFinGraph>::E;

    fn has_vertex(&self, v: &Self::V) -> bool {
        self.vertex_set().contains(v)
    }

    fn has_edge(&self, e: &Self::E) -> bool {
        self.edge_set().contains(e)
    }

    fn src(&self, e: &Self::E) -> Self::V {
        let src = self.src_map();
        src.apply(e).expect("Source of edge should be defined").clone()
    }

    fn tgt(&self, e: &Self::E) -> Self::V {
        let tgt = self.tgt_map();
        tgt.apply(e).expect("Target of edge should be defined").clone()
    }
}

struct VecGraph {
    vertices: SkelFinSet,
    edges: SkelFinSet,
    src: VecMapping<usize>,
    tgt: VecMapping<usize>,
}

impl MapBasedFinGraph for VecGraph {
    type V = usize;
    type E = usize;
    type VSet = SkelFinSet;
    type ESet = SkelFinSet;
    type Map = VecMapping<usize>;

    fn vertex_set(&self) -> &Self::VSet { &self.vertices }
    fn edge_set(&self) -> &Self::ESet { &self.edges }
    fn src_map(&self) -> &Self::Map { &self.src }
    fn tgt_map(&self) -> &Self::Map { &self.tgt }
}
