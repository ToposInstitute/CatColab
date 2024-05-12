//! Graphs, finite and infinite.

use std::hash::Hash;
use nonempty::NonEmpty;
use thiserror::Error;

use crate::validate::{self, Validate};
use crate::zero::*;

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

    /** Iterates over the edges incoming to a vertex.

    Depending on whether the target map is indexed, this method can be cheap or
    expensive.
    */
    fn in_edges(&self, v: &Self::V) -> impl Iterator<Item = Self::E> {
        self.edges().filter(|e| self.tgt(e) == *v)
    }

    /** Iterates over the edges outgoing from a vertex.

    Depending on whether the source map is indexed, this method can be cheap or
    expensive.
    */
    fn out_edges(&self, v: &Self::V) -> impl Iterator<Item = Self::E> {
        self.edges().filter(|e| self.src(e) == *v)
    }

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

Such a graph is defined in the styles of "C-sets" by two [finite sets](FinSet)
and two [columns](Column).
 */
#[derive(Clone,Default)]
pub struct ColumnarGraph<VSet,ESet,Col> {
    vertex_set: VSet,
    edge_set: ESet,
    src_map: Col,
    tgt_map: Col,
}

/// An invalid assignment in a [columnar graph](ColumnarGraph).
#[derive(Debug,Error)]
pub enum ColumnarGraphInvalid<E> {
    /// Edge with a source that is not a valid vertex.
    #[error("Source of edge `{0}` is not a vertex in the graph")]
    Src(E),

    /// Edge with a target that is not a valid vertex.
    #[error("Target of edge `{0}` is not a vertex in the graph")]
    Tgt(E),
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

impl<V,E,VSet,ESet,Col> Validate for ColumnarGraph<VSet,ESet,Col>
where V: Eq + Clone, E: Eq + Clone,
      VSet: FinSet<Elem=V>, ESet: FinSet<Elem=E>, Col: Mapping<Dom=E,Cod=V> {
    type ValidationError = ColumnarGraphInvalid<E>;

    fn iter_invalid(&self) -> impl Iterator<Item = Self::ValidationError> {
        let (dom, cod) = (&self.edge_set, &self.vertex_set);
        let srcs = self.src_map.iter_not_functional(dom, cod).map(
            |e| ColumnarGraphInvalid::Src(e.take()));
        let tgts = self.tgt_map.iter_not_functional(dom, cod).map(
            |e| ColumnarGraphInvalid::Tgt(e.take()));
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
where Col: Mapping<Dom=usize, Cod=usize> {
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
where V: Eq+Hash+Clone, E: Eq+Hash+Clone, Col: Mapping<Dom=E, Cod=V> {
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
pub type SkelGraph = ColumnarGraph<SkelFinSet,SkelFinSet,SkelIndexedColumn>;

/** A finite graph with indexed source and target maps, based on hash maps.

Unlike in a skeletal finite graph, the vertices and edges can have arbitrary
hashable types.
*/
pub type HashGraph<V,E> =
    ColumnarGraph<HashFinSet<V>, HashFinSet<E>, IndexedHashColumn<E,V>>;

/** A mapping between graphs.

Like a [`Mapping`] is the data of a function without specified domain or
codomain sets, a *graph mapping* is the data of a graph homomorphism without
specified domain or codomain graphs. Put positively, a *graph morphism* is a
pair of graphs with a compatible graph mapping.
 */
pub trait GraphMapping {
    /// Type of vertices in domain graph.
    type DomV: Eq;

    /// Type of edges in domain graph.
    type DomE: Eq;

    /// Type of vertices in codomain graph.
    type CodV: Eq;

    /// Type of edges in codomain graph.
    type CodE: Eq;

    /// Applies the graph mapping at a vertex.
    fn apply_vertex(&self, v: &Self::DomV) -> Option<&Self::CodV>;

    /// Applies the graph mappting at an edge.
    fn apply_edge(&self, e: &Self::DomE) -> Option<&Self::CodE>;

    /// Validates that the mapping is a graph homomorphism between two graphs.
    fn validate_is_morphism<Dom,Cod>(&self, dom: &Dom, cod: &Cod
    ) -> Result<(), NonEmpty<GraphMorphismInvalid<Self::DomV, Self::DomE>>>
    where Dom: FinGraph<V = Self::DomV, E = Self::DomE>,
          Cod: Graph<V = Self::CodV, E = Self::CodE> {
        validate::collect_errors(self.iter_morphism_invalid(dom, cod))
    }

    /// Iterates over failues of the mapping to be a graph homomorphism.
    fn iter_morphism_invalid<Dom,Cod>(&self, dom: &Dom, cod: &Cod
    ) -> impl Iterator<Item = GraphMorphismInvalid<Self::DomV, Self::DomE>>
    where Dom: FinGraph<V = Self::DomV, E = Self::DomE>,
          Cod: Graph<V = Self::CodV, E = Self::CodE> {

        let vertex_errors = dom.vertices().filter_map(|v| {
            if self.apply_vertex(&v).map_or(false, |w| cod.has_vertex(w)) {
                None
            } else {
                Some(GraphMorphismInvalid::Vertex(v))
            }
        });

        let edge_errors = dom.edges().filter_map(|e| {
            if let Some(f) = self.apply_edge(&e) {
                if cod.has_edge(f) {
                    if self.apply_vertex(&dom.src(&e))
                           .map_or(true, |v| *v == cod.src(f)) &&
                        self.apply_vertex(&dom.tgt(&e))
                            .map_or(true, |v| *v == cod.tgt(f)) {
                        return None
                    } else {
                        return Some(GraphMorphismInvalid::NotHomomorphic(e))
                    }
                }
            }
            Some(GraphMorphismInvalid::Edge(e))
        });

        vertex_errors.chain(edge_errors)
    }
}

/// A failure of a [mapping](GraphMapping) between graphs to define a graph
/// homomorphism.
#[derive(Debug,Error)]
pub enum GraphMorphismInvalid<V,E> {
    /// A vertex in the domain that is not mapped to a vertex in the codomain.
    #[error("Vertex `{0}` is not mapped to a vertex in the codomain graph")]
    Vertex(V),

    /// An edge in the domain that is not mapped to an edge in the codomain.
    #[error("Edge `{0}` is not mapped to an edge in the codomain graph")]
    Edge(E),

    /// An edge in the domain that does not have a homomorphic assignment.
    #[error("Edge `{0}` has an assignment that is not homomorphic")]
    NotHomomorphic(E),
}

/** A graph mapping backed by columns.

That is, the data of the graph mapping is defined by two columns. The mapping
can be between arbitrary graphs with compatible vertex and edge types.
*/
#[derive(Clone,Default)]
pub struct ColumnarGraphMapping<ColV,ColE> {
    vertex_map: ColV,
    edge_map: ColE,
}

impl<ColV,ColE> ColumnarGraphMapping<ColV,ColE> {
    /// Constructs a new graph mapping from existing columns.
    pub fn new(vertex_map: ColV, edge_map: ColE) -> Self {
        Self { vertex_map: vertex_map, edge_map: edge_map }
    }
}

impl<ColV,ColE> GraphMapping for ColumnarGraphMapping<ColV,ColE>
where ColV: Mapping, ColE: Mapping {
    type DomV = ColV::Dom;
    type DomE = ColE::Dom;
    type CodV = ColV::Cod;
    type CodE = ColE::Cod;

    fn apply_vertex(&self, v: &Self::DomV) -> Option<&Self::CodV> {
        self.vertex_map.apply(v)
    }
    fn apply_edge(&self, e: &Self::DomE) -> Option<&Self::CodE> {
        self.edge_map.apply(e)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skel_graph() {
        let g = SkelGraph::triangle();
        assert_eq!(g.nv(), 3);
        assert_eq!(g.ne(), 3);
        assert_eq!(g.src(&1), 1);
        assert_eq!(g.tgt(&1), 2);
        assert_eq!(g.out_edges(&0).collect::<Vec<_>>(), vec![0,2]);
        assert_eq!(g.in_edges(&2).collect::<Vec<_>>(), vec![1,2]);
    }

    #[test]
    fn hash_graph() {
        let mut g: HashGraph<char,&str> = Default::default();
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
        let mut g = SkelGraph::triangle();
        assert!(g.validate().is_ok());
        g.set_src(2, 3); // Vertex 3 doesn't exist yet.
        assert!(g.validate().is_err());
        assert_eq!(g.add_vertex(), 3); // OK, now it does!
        assert!(g.validate().is_ok());
    }

    #[test]
    fn validate_graph_mapping() {
        let g = SkelGraph::path(3);
        let h = SkelGraph::path(4);
        let f = ColumnarGraphMapping::new(
            VecColumn::new(vec![1,2,3]), VecColumn::new(vec![1,2])
        );
        assert!(f.validate_is_morphism(&g, &h).is_ok());

        let f = ColumnarGraphMapping::new(
            VecColumn::new(vec![1,2,3]), VecColumn::new(vec![2,1])
        ); // Not a homomorphism.
        assert!(f.validate_is_morphism(&g, &h).is_err());
    }
}
