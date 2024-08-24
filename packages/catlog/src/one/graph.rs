/*! Graphs, finite and infinite.

Graphs are the fundamental combinatorial structure in category theory and a
basic building block for higher dimensional categories. We thus aim to provide a
flexible set of traits and structs for graphs as they are used in category
theory.
 */

use std::hash::{BuildHasher, BuildHasherDefault, Hash, RandomState};

use derivative::Derivative;
use nonempty::NonEmpty;
use ref_cast::RefCast;
use thiserror::Error;
use ustr::{IdentityHasher, Ustr};

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
    fn vertex_count(&self) -> usize {
        self.vertices().count()
    }

    /// Number of edges in the graph.
    fn edge_count(&self) -> usize {
        self.edges().count()
    }

    /// Number of edges incoming to a vertex.
    fn in_degree(&self, v: &Self::V) -> usize {
        self.in_edges(v).count()
    }

    /// Number of edges outgoing from a vertex.
    fn out_degree(&self, v: &Self::V) -> usize {
        self.out_edges(v).count()
    }

    /** Number of edges incoming to or outgoing from a vertex.

    Self-loops are counted twice.
     */
    fn degree(&self, v: &Self::V) -> usize {
        self.in_degree(v) + self.out_degree(v)
    }
}

/** A finite graph backed by columns.

Such a graph is defined in the styles of "C-sets" by two [finite sets](FinSet)
and two [columns](Column). Note that this trait does *not* extend [`Graph`]. To
derive an implementation, implement the further trait
[`ColumnarGraphImplGraph`]. It also does not assume that the graph is mutable;
for that, implement the trait [`ColumnarGraphMut`].
 */
pub trait ColumnarGraph {
    /// Type of vertices in the columnar graph.
    type V: Eq + Clone;

    /// Type of edges in the columnar graph.
    type E: Eq + Clone;

    /// Gets the set of vertices.
    fn vertex_set(&self) -> &impl FinSet<Elem = Self::V>;

    /// Gets the set of edges.
    fn edge_set(&self) -> &impl FinSet<Elem = Self::E>;

    /// Gets the mapping assigning a source vertex to each edge.
    fn src_map(&self) -> &impl Column<Dom = Self::E, Cod = Self::V>;

    /// Gets the mapping assignment a target vertex to each edge.
    fn tgt_map(&self) -> &impl Column<Dom = Self::E, Cod = Self::V>;

    /// Gets the source of an edge, possibly undefined.
    fn get_src(&self, e: &Self::E) -> Option<&Self::V> {
        self.src_map().apply(e)
    }

    /// Gets the target of an edge, possibly undefined.
    fn get_tgt(&self, e: &Self::E) -> Option<&Self::V> {
        self.tgt_map().apply(e)
    }

    /// Iterates over failures to be a valid graph.
    fn iter_invalid(&self) -> impl Iterator<Item = InvalidGraphData<Self::E>> {
        let (dom, cod) = (self.edge_set(), self.vertex_set());
        let srcs = Function(self.src_map(), dom, cod)
            .iter_invalid()
            .map(|e| InvalidGraphData::Src(e.take()));
        let tgts = Function(self.tgt_map(), dom, cod)
            .iter_invalid()
            .map(|e| InvalidGraphData::Tgt(e.take()));
        srcs.chain(tgts)
    }
}

/** Columnar graph with mutable columns.
 */
pub trait ColumnarGraphMut: ColumnarGraph {
    /// Variant of [`src_map`](ColumnarGraph::src_map) that returns a mutable
    /// reference.
    fn src_map_mut(&mut self) -> &mut impl Column<Dom = Self::E, Cod = Self::V>;

    /// Variant of [`tgt_map`](ColumnarGraph::tgt_map) that returns a mutable
    /// reference.
    fn tgt_map_mut(&mut self) -> &mut impl Column<Dom = Self::E, Cod = Self::V>;

    /// Sets the source of an edge.
    fn set_src(&mut self, e: Self::E, v: Self::V) -> Option<Self::V> {
        self.src_map_mut().set(e, v)
    }

    /// Sets the target of an edge.
    fn set_tgt(&mut self, e: Self::E, v: Self::V) -> Option<Self::V> {
        self.tgt_map_mut().set(e, v)
    }

    /// Updates the source of an edge, setting or unsetting it.
    fn update_src(&mut self, e: Self::E, v: Option<Self::V>) -> Option<Self::V> {
        self.src_map_mut().update(e, v)
    }

    /// Updates the source of an edge, setting or unsetting it.
    fn update_tgt(&mut self, e: Self::E, v: Option<Self::V>) -> Option<Self::V> {
        self.tgt_map_mut().update(e, v)
    }
}

/** Derive implementation of a graph from a columnar graph.

Implementing this trait provides a *blanket implementation* of [`Graph`] and
[`FinGraph`].
 */
pub trait ColumnarGraphImplGraph: ColumnarGraph {}

impl<G: ColumnarGraphImplGraph> Graph for G {
    type V = G::V;
    type E = G::E;

    fn has_vertex(&self, v: &Self::V) -> bool {
        self.vertex_set().contains(v)
    }
    fn has_edge(&self, e: &Self::E) -> bool {
        self.edge_set().contains(e)
    }
    fn src(&self, e: &Self::E) -> Self::V {
        self.get_src(e).expect("Source of edge should be set").clone()
    }
    fn tgt(&self, e: &Self::E) -> Self::V {
        self.get_tgt(e).expect("Target of edge should be set").clone()
    }
}

impl<G: ColumnarGraphImplGraph> FinGraph for G {
    fn vertices(&self) -> impl Iterator<Item = Self::V> {
        self.vertex_set().iter()
    }
    fn edges(&self) -> impl Iterator<Item = Self::E> {
        self.edge_set().iter()
    }
    fn in_edges(&self, v: &Self::V) -> impl Iterator<Item = Self::E> {
        self.tgt_map().preimage(v)
    }
    fn out_edges(&self, v: &Self::V) -> impl Iterator<Item = Self::E> {
        self.src_map().preimage(v)
    }
    fn vertex_count(&self) -> usize {
        self.vertex_set().len()
    }
    fn edge_count(&self) -> usize {
        self.edge_set().len()
    }
}

/** An invalid assignment in a graph defined explicitly by data.

For [columnar graphs](ColumnarGraph) and other such graphs, it is possible that
the data is incomplete or inconsistent.
*/
#[derive(Debug, Error)]
pub enum InvalidGraphData<E> {
    /// Edge assigned a source that is not a vertex contained in the graph.
    #[error("Source of edge `{0}` is not a vertex in the graph")]
    Src(E),

    /// Edge assigned a target that is not a vertex contained in the graph.
    #[error("Target of edge `{0}` is not a vertex in the graph")]
    Tgt(E),
}

/** A skeletal finite graph with indexed source and target maps.

The data structure is the same as the standard `Graph` type in
[Catlab.jl](https://github.com/AlgebraicJulia/Catlab.jl).
 */
#[derive(Clone, Default, PartialEq, Eq)]
pub struct SkelGraph {
    nv: usize,
    ne: usize,
    src_map: SkelIndexedColumn,
    tgt_map: SkelIndexedColumn,
}

impl ColumnarGraph for SkelGraph {
    type V = usize;
    type E = usize;

    fn vertex_set(&self) -> &impl FinSet<Elem = usize> {
        SkelFinSet::ref_cast(&self.nv)
    }
    fn edge_set(&self) -> &impl FinSet<Elem = usize> {
        SkelFinSet::ref_cast(&self.ne)
    }
    fn src_map(&self) -> &impl Column<Dom = usize, Cod = usize> {
        &self.src_map
    }
    fn tgt_map(&self) -> &impl Column<Dom = usize, Cod = usize> {
        &self.tgt_map
    }
}

impl ColumnarGraphMut for SkelGraph {
    fn src_map_mut(&mut self) -> &mut impl Column<Dom = usize, Cod = usize> {
        &mut self.src_map
    }
    fn tgt_map_mut(&mut self) -> &mut impl Column<Dom = usize, Cod = usize> {
        &mut self.tgt_map
    }
}

impl ColumnarGraphImplGraph for SkelGraph {}

impl SkelGraph {
    /// Adds a new vertex to the graph and returns it.
    pub fn add_vertex(&mut self) -> usize {
        let v = self.nv;
        self.nv += 1;
        v
    }

    /// Adds `n` new vertices to the graphs and returns them.
    pub fn add_vertices(&mut self, n: usize) -> std::ops::Range<usize> {
        let start = self.nv;
        self.nv += n;
        start..(self.nv)
    }

    /// Adds a new edge to the graph and returns it.
    pub fn add_edge(&mut self, src: usize, tgt: usize) -> usize {
        let e = self.make_edge();
        self.src_map.set(e, src);
        self.tgt_map.set(e, tgt);
        e
    }

    /// Adds a new edge without initializing its source or target.
    pub fn make_edge(&mut self) -> usize {
        let e = self.ne;
        self.ne += 1;
        e
    }

    /// Makes a path graph with `n` vertices.
    #[cfg(test)]
    pub fn path(n: usize) -> Self {
        let mut g: Self = Default::default();
        g.add_vertices(n);
        for (i, j) in std::iter::zip(0..(n - 1), 1..n) {
            g.add_edge(i, j);
        }
        g
    }

    /// Makes a triangle graph (2-simplex).
    #[cfg(test)]
    pub fn triangle() -> Self {
        let mut g: Self = Default::default();
        g.add_vertices(3);
        g.add_edge(0, 1);
        g.add_edge(1, 2);
        g.add_edge(0, 2);
        g
    }

    /// Make a cycle graph with `n` vertices.
    #[cfg(test)]
    pub fn cycle(n: usize) -> Self {
        assert!(n > 0);
        let mut g = SkelGraph::path(n);
        g.add_edge(n - 1, 0);
        g
    }
}

impl Validate for SkelGraph {
    type ValidationError = InvalidGraphData<usize>;

    fn validate(&self) -> Result<(), NonEmpty<Self::ValidationError>> {
        validate::wrap_errors(self.iter_invalid())
    }
}

/** A finite graph with indexed source and target maps, based on hash maps.

Unlike in a skeletal finite graph, the vertices and edges can have arbitrary
hashable types.
*/
#[derive(Clone, Derivative)]
#[derivative(Default(bound = "S: Default"))]
#[derivative(PartialEq(bound = "V: Eq + Hash, E: Eq + Hash, S: BuildHasher"))]
#[derivative(Eq(bound = "V: Eq + Hash, E: Eq + Hash, S: BuildHasher"))]
pub struct HashGraph<V, E, S = RandomState> {
    vertex_set: HashFinSet<V, S>,
    edge_set: HashFinSet<E, S>,
    src_map: IndexedHashColumn<E, V, S>,
    tgt_map: IndexedHashColumn<E, V, S>,
}

/// A finite graph with vertices and edges of type `Ustr`.
pub type UstrGraph = HashGraph<Ustr, Ustr, BuildHasherDefault<IdentityHasher>>;

impl<V, E, S> ColumnarGraph for HashGraph<V, E, S>
where
    V: Eq + Hash + Clone,
    E: Eq + Hash + Clone,
    S: BuildHasher,
{
    type V = V;
    type E = E;

    fn vertex_set(&self) -> &impl FinSet<Elem = V> {
        &self.vertex_set
    }
    fn edge_set(&self) -> &impl FinSet<Elem = E> {
        &self.edge_set
    }
    fn src_map(&self) -> &impl Column<Dom = E, Cod = V> {
        &self.src_map
    }
    fn tgt_map(&self) -> &impl Column<Dom = E, Cod = V> {
        &self.tgt_map
    }
}

impl<V, E, S> ColumnarGraphMut for HashGraph<V, E, S>
where
    V: Eq + Hash + Clone,
    E: Eq + Hash + Clone,
    S: BuildHasher,
{
    fn src_map_mut(&mut self) -> &mut impl Column<Dom = E, Cod = V> {
        &mut self.src_map
    }
    fn tgt_map_mut(&mut self) -> &mut impl Column<Dom = E, Cod = V> {
        &mut self.tgt_map
    }
}

impl<V, E, S> ColumnarGraphImplGraph for HashGraph<V, E, S>
where
    V: Eq + Hash + Clone,
    E: Eq + Hash + Clone,
    S: BuildHasher,
{
}

impl<V, E, S> HashGraph<V, E, S>
where
    V: Eq + Hash + Clone,
    E: Eq + Hash + Clone,
    S: BuildHasher,
{
    /// Adds a vertex to the graph, returning whether the vertex is new.
    pub fn add_vertex(&mut self, v: V) -> bool {
        self.vertex_set.insert(v)
    }

    /// Adds multiple vertices to the graph.
    pub fn add_vertices<T>(&mut self, iter: T)
    where
        T: IntoIterator<Item = V>,
    {
        self.vertex_set.extend(iter)
    }

    /** Adds an edge to the graph, returning whether the edge is new.

    If the edge is not new, its source and target are updated.
    */
    pub fn add_edge(&mut self, e: E, src: V, tgt: V) -> bool {
        self.src_map.set(e.clone(), src);
        self.tgt_map.set(e.clone(), tgt);
        self.make_edge(e)
    }

    /// Adds an edge without initializing its source or target.
    pub fn make_edge(&mut self, e: E) -> bool {
        self.edge_set.insert(e)
    }
}

impl<V, E, S> Validate for HashGraph<V, E, S>
where
    V: Eq + Hash + Clone,
    E: Eq + Hash + Clone,
    S: BuildHasher,
{
    type ValidationError = InvalidGraphData<E>;

    fn validate(&self) -> Result<(), NonEmpty<Self::ValidationError>> {
        validate::wrap_errors(self.iter_invalid())
    }
}

/** A mapping between graphs.

Just as a [`Mapping`] is the data of a function without specified domain or
codomain sets, a *graph mapping* is the data of a graph homomorphism without
specified domain or codomain graphs. Turning this around, a *graph morphism* is
a pair of graphs with a compatible graph mapping.
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

    /// Applies the graph mapping at an edge.
    fn apply_edge(&self, e: &Self::DomE) -> Option<&Self::CodE>;

    /// Is the mapping defined at a vertex?
    fn is_vertex_assigned(&self, v: &Self::DomV) -> bool {
        self.apply_vertex(v).is_some()
    }

    /// Is the mapping defined at an edge?
    fn is_edge_assigned(&self, e: &Self::DomE) -> bool {
        self.apply_edge(e).is_some()
    }
}

/** A homomorphism between graphs defined by a [mapping](GraphMapping).

This struct borrows its data to perform validation. The domain and codomain are
assumed to be valid graphs. If that is in question, the graphs should be
validated *before* valiating this object.
 */
pub struct GraphMorphism<'a, Map, Dom, Cod>(pub &'a Map, pub &'a Dom, pub &'a Cod);

impl<'a, Map, Dom, Cod> GraphMorphism<'a, Map, Dom, Cod>
where
    Map: GraphMapping,
    Map::DomE: Clone,
    Dom: FinGraph<V = Map::DomV, E = Map::DomE>,
    Cod: Graph<V = Map::CodV, E = Map::CodE>,
{
    /// Iterates over failues of the mapping to be a graph homomorphism.
    pub fn iter_invalid(
        &self,
    ) -> impl Iterator<Item = InvalidGraphMorphism<Map::DomV, Map::DomE>> + 'a {
        let GraphMorphism(mapping, dom, cod) = *self;
        let vertex_errors = dom.vertices().filter_map(|v| {
            if mapping.apply_vertex(&v).map_or(false, |w| cod.has_vertex(w)) {
                None
            } else {
                Some(InvalidGraphMorphism::Vertex(v))
            }
        });

        let edge_errors = dom.edges().flat_map(|e| {
            if let Some(f) = mapping.apply_edge(&e) {
                if cod.has_edge(f) {
                    let mut errs = Vec::new();
                    if !mapping.apply_vertex(&dom.src(&e)).map_or(true, |v| *v == cod.src(f)) {
                        errs.push(InvalidGraphMorphism::Src(e.clone()))
                    }
                    if !mapping.apply_vertex(&dom.tgt(&e)).map_or(true, |v| *v == cod.tgt(f)) {
                        errs.push(InvalidGraphMorphism::Tgt(e.clone()))
                    }
                    return errs;
                }
            }
            vec![InvalidGraphMorphism::Edge(e)]
        });

        vertex_errors.chain(edge_errors)
    }
}

impl<Map, Dom, Cod> Validate for GraphMorphism<'_, Map, Dom, Cod>
where
    Map: GraphMapping,
    Map::DomE: Clone,
    Dom: FinGraph<V = Map::DomV, E = Map::DomE>,
    Cod: Graph<V = Map::CodV, E = Map::CodE>,
{
    type ValidationError = InvalidGraphMorphism<Map::DomV, Map::DomE>;

    fn validate(&self) -> Result<(), NonEmpty<Self::ValidationError>> {
        validate::wrap_errors(self.iter_invalid())
    }
}

/// A failure of a [mapping](GraphMapping) between graphs to define a graph
/// homomorphism.
#[derive(Debug, Error)]
pub enum InvalidGraphMorphism<V, E> {
    /// A vertex in the domain graph not mapped to a vertex in the codomain.
    #[error("Vertex `{0}` is not mapped to a vertex in the codomain")]
    Vertex(V),

    /// An edge in the domain graph not mapped to an edge in the codomain.
    #[error("Edge `{0}` is not mapped to an edge in the codomain")]
    Edge(E),

    /// An edge in the domain graph whose source is not preserved.
    #[error("Mapping of edge `{0}` does not preserve its source")]
    Src(E),

    /// An edge in the domain graph whose target is not preserved.
    #[error("Mapping of edge `{0}` does not preserve its target")]
    Tgt(E),
}

/** A graph mapping backed by columns.

That is, the data of the graph mapping is defined by two columns. The mapping
can be between arbitrary graphs with compatible vertex and edge types.
*/
#[derive(Clone, Default)]
pub struct ColumnarGraphMapping<ColV, ColE> {
    vertex_map: ColV,
    edge_map: ColE,
}

impl<ColV, ColE> ColumnarGraphMapping<ColV, ColE> {
    /// Constructs a new graph mapping from existing columns.
    pub fn new(vertex_map: ColV, edge_map: ColE) -> Self {
        Self {
            vertex_map,
            edge_map,
        }
    }
}

impl<ColV, ColE> GraphMapping for ColumnarGraphMapping<ColV, ColE>
where
    ColV: Mapping,
    ColE: Mapping,
{
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
    fn is_vertex_assigned(&self, v: &Self::DomV) -> bool {
        self.vertex_map.is_set(v)
    }
    fn is_edge_assigned(&self, e: &Self::DomE) -> bool {
        self.edge_map.is_set(e)
    }
}

/** An element in a graph.

This type plays no role in the core API for graphs but is useful on rare
occasion when heterogeneous collection of vertices *and* edges is needed.
 */
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum GraphElem<V, E> {
    /// A vertex in a graph.
    Vertex(V),

    /// An edge in a graph.
    Edge(E),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skel_graph() {
        let g = SkelGraph::triangle();
        assert_eq!(g.vertex_count(), 3);
        assert_eq!(g.edge_count(), 3);
        assert_eq!(g.src(&1), 1);
        assert_eq!(g.tgt(&1), 2);
        assert_eq!(g.out_edges(&0).collect::<Vec<_>>(), vec![0, 2]);
        assert_eq!(g.in_edges(&2).collect::<Vec<_>>(), vec![1, 2]);
        assert_eq!(g.out_degree(&0), 2);
        assert_eq!(g.in_degree(&2), 2);
        assert_eq!(g.degree(&1), 2);
    }

    #[test]
    fn hash_graph() {
        let mut g: HashGraph<char, &str> = Default::default();
        assert!(g.add_vertex('x'));
        g.add_vertices(['y', 'z']);
        assert!(g.add_edge("f", 'x', 'y'));
        assert!(g.add_edge("g", 'y', 'z'));
        assert!(g.make_edge("fg"));
        g.set_src("fg", 'x');
        g.set_tgt("fg", 'z');
        assert_eq!(g.src(&"fg"), 'x');
        assert_eq!(g.tgt(&"fg"), 'z');
    }

    #[test]
    fn validate_columnar_graph() {
        let mut g = SkelGraph::triangle();
        assert!(g.validate().is_ok());
        g.src_map.set(2, 3); // Vertex 3 doesn't exist yet.
        assert!(g.validate().is_err());
        assert_eq!(g.add_vertex(), 3); // OK, now it does!
        assert!(g.validate().is_ok());
    }

    #[test]
    fn validate_graph_morphism() {
        let g = SkelGraph::path(3);
        let h = SkelGraph::path(4);
        let f =
            ColumnarGraphMapping::new(VecColumn::new(vec![1, 2, 3]), VecColumn::new(vec![1, 2]));
        assert!(GraphMorphism(&f, &g, &h).validate().is_ok());

        let f =
            ColumnarGraphMapping::new(VecColumn::new(vec![1, 2, 3]), VecColumn::new(vec![2, 1])); // Not a homomorphism.
        assert!(GraphMorphism(&f, &g, &h).validate().is_err());
    }
}
