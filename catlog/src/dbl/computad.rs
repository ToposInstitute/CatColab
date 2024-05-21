/*! Double computads, the generators of free double categories.

Double computads are like double graphs (two-dimensional cubical sets) except
that the boundaries of the two-dimensional cells can be paths of arbitrary
finite length instead just single edges. A double computad is the most general
data that generates a free double category.

Though the term "double computad" is not standard, it is the obvious analogue
for double categories of a [2-computad](https://ncatlab.org/nlab/show/computad),
the generating data for a free 2-category or bicategory. Double computads have
also been called "double signatures" (Delpeuch 2020, Definition 2.1). They are
the special case of "double derivation schemes" in which the categories of
objects and arrows, and of objects and proarrows, are both free categories
(Fiore et al 2008, Definition 3.3).

# References

- Fiore, Paoli, Pronk, 2008: Model structures on the category of small double
  categories ([arXiv](https://arxiv.org/abs/0711.0473))
- Delpeuch, 2020: The word problem for double categories
  ([arXiv](https://arxiv.org/abs/1907.09927))
*/

use std::hash::Hash;
use derive_more::From;
use nonempty::NonEmpty;
use ref_cast::RefCast;
use thiserror::Error;

use crate::validate::{self, Validate};
use crate::zero::*;
use crate::one::path::{Path, SkelPath};
use crate::one::graph::*;

/** A double computad, the generating data for a free double category.

Following our nomenclature for double categories, we say that an edge in a
double computad has a *domain* and *codomain*, whereas a proedge has a *source*
and a *target*. A square has all four of those.
 */
pub trait DblComputad {
    /// Type of vertices in the computad, generating objects in a double
    /// category.
    type V: Eq;

    /// Type of edges in the computad, generating arrows in a double category.
    type E: Eq;

    /// Type of "pro-edges" in the computad, generating proarrows in a double
    /// category.
    type ProE: Eq;

    /// Type of squares in the computad, generating cells in a double category.
    type Sq: Eq;

    /// Does the vertex belong to the computad?
    fn has_vertex(&self, v: &Self::V) -> bool;

    /// Does the edge belong to the computad?
    fn has_edge(&self, e: &Self::E) -> bool;

    /// Does the proedge belong to the computad?
    fn has_proedge(&self, p: &Self::ProE) -> bool;

    /// Does the square belong to the comptuad?
    fn has_square(&self, α: &Self::Sq) -> bool;

    /// Gets the domain of an edge.
    fn dom(&self, e: &Self::E) -> Self::V;

    /// Gets the codomain of an edge.
    fn cod(&self, e: &Self::E) -> Self::V;

    /// Gets the source of a proedge.
    fn src(&self, p: &Self::ProE) -> Self::V;

    /// Gets the target of a proedge.
    fn tgt(&self, p: &Self::ProE) -> Self::V;

    /// Gets the domain of a square, which is a path of proedges.
    fn square_dom(&self, α: &Self::Sq) -> Path<Self::V, Self::ProE>;

    /// Gets the codomain of a square, which is a path of proedges.
    fn square_cod(&self, α: &Self::Sq) -> Path<Self::V, Self::ProE>;

    /// Gets the source of a square, which is a path of edges.
    fn square_src(&self, α: &Self::Sq) -> Path<Self::V, Self::E>;

    /// Gets the target of a square, which is a path of edges.
    fn square_tgt(&self, α: &Self::Sq) -> Path<Self::V, Self::E>;
}

/** A finite double computad.

Such a double computad has finitely many vertices, edges, proedges, and squares.
 */
pub trait FinDblComputad: DblComputad {
    /// Iterates over vertices in the computad.
    fn vertices(&self) -> impl Iterator<Item = Self::V>;

    /// Iterates over edges in the computad.
    fn edges(&self) -> impl Iterator<Item = Self::E>;

    /// Iterates over proedges in the computad.
    fn proedges(&self) -> impl Iterator<Item = Self::ProE>;

    /// Iterates over squares in the computad.
    fn squares(&self) -> impl Iterator<Item = Self::Sq>;
}

/** A double computad backed by columns.

Sets and columns are assumed to have the same type whenever that makes sense.
There is no reason for this except to avoid an explosion of type parameters.
*/
#[derive(Clone,Default)]
pub struct ColumnarDblComputad<S,Col1,Col2> {
    vertex_set: S, edge_set: S, proedge_set: S, square_set: S,
    dom_map: Col1, cod_map: Col1, src_map: Col1, tgt_map: Col1,
    square_dom_map: Col2, square_cod_map: Col2,
    square_src_map: Col2, square_tgt_map: Col2,
}

/// An invalid assignment in a columnar double computad.
#[derive(Debug,Error)]
pub enum InvalidColumnarDblComputad<T> {
    /// Edge with a domain that is not a valid vertex.
    #[error("Domain of edge `{0}` is not a vertex in the computad")]
    Dom(T),

    /// Edge with a codomain that is not a valid vertex.
    #[error("Codomain of edge `{0}` is not a vertex in the computad")]
    Cod(T),

    /// Proedge with a source that is not a valid vertex.
    #[error("Source of proedge `{0}` is not a vertex in the computad")]
    Src(T),

    /// Proedge with a target that is not a valid vertex.
    #[error("Target of proedge `{0}` is not a vertex in the computad")]
    Tgt(T),

    /// Square with a domain that is not a valid path of proedges.
    #[error("Domain of square `{0}` is not a path of proedges in the computad")]
    SquareDom(T),

    /// Square with a codomain that is not a valid path of proedges.
    #[error("Codomain of square `{0}` is not a path of proedges in the computad")]
    SquareCod(T),

    /// Square with a source that is not a valid path of edges.
    #[error("Source of square `{0}` is not a path of edges in the computad")]
    SquareSrc(T),

    /// Square with a target that is not a valid path of edges.
    #[error("Target of square `{0}` is not a path of edges in the computad")]
    SquareTgt(T),

    /// Square that is not square-shaped: compatibility equations do not hold.
    #[error("Square `{0}` is not square-shaped")]
    NotSquare(T),
}

impl<S,Col1,Col2> DblComputad for ColumnarDblComputad<S,Col1,Col2>
where S: Set, S::Elem: Clone,
      Col1: Mapping<Dom=S::Elem, Cod=S::Elem>,
      Col2: Mapping<Dom=S::Elem, Cod=Path<S::Elem,S::Elem>> {
    type V = S::Elem;
    type E = S::Elem;
    type ProE = S::Elem;
    type Sq = S::Elem;

    fn has_vertex(&self, v: &Self::V) -> bool { self.vertex_set.contains(v) }
    fn has_edge(&self, e: &Self::E) -> bool { self.edge_set.contains(e) }
    fn has_proedge(&self, p: &Self::ProE) -> bool { self.proedge_set.contains(p) }
    fn has_square(&self, α: &Self::Sq) -> bool { self.square_set.contains(α) }

    fn dom(&self, e: &Self::E) -> Self::V {
        self.dom_map.apply(e).expect("Domain of edge should be set").clone()
    }
    fn cod(&self, e: &Self::E) -> Self::V {
        self.cod_map.apply(e).expect("Codomain of edge should be set").clone()
    }
    fn src(&self, p: &Self::ProE) -> Self::V {
        self.src_map.apply(p).expect("Source of proedge should be set").clone()
    }
    fn tgt(&self, p: &Self::ProE) -> Self::V {
        self.tgt_map.apply(p).expect("Target of proedge should be set").clone()
    }

    fn square_dom(&self, α: &Self::Sq) -> Path<Self::V, Self::ProE> {
        self.square_dom_map.apply(α).expect("Domain of square should be set").clone()
    }
    fn square_cod(&self, α: &Self::Sq) -> Path<Self::V, Self::ProE> {
        self.square_cod_map.apply(α).expect("Codomain of square should be set").clone()
    }
    fn square_src(&self, α: &Self::Sq) -> Path<Self::V, Self::E> {
        self.square_src_map.apply(α).expect("Source of square should be set").clone()
    }
    fn square_tgt(&self, α: &Self::Sq) -> Path<Self::V, Self::E> {
        self.square_tgt_map.apply(α).expect("Target of square should be set").clone()
    }
}

impl<S,Col1,Col2> FinDblComputad for ColumnarDblComputad<S,Col1,Col2>
where S: FinSet, S::Elem: Clone,
      Col1: Mapping<Dom=S::Elem, Cod=S::Elem>,
      Col2: Mapping<Dom=S::Elem, Cod=Path<S::Elem,S::Elem>> {

    fn vertices(&self) -> impl Iterator<Item=Self::V> { self.vertex_set.iter() }
    fn edges(&self) -> impl Iterator<Item=Self::E> { self.edge_set.iter() }
    fn proedges(&self) -> impl Iterator<Item=Self::ProE> { self.proedge_set.iter() }
    fn squares(&self) -> impl Iterator<Item=Self::Sq> { self.square_set.iter() }
}

impl<S,Col1,Col2> Validate for ColumnarDblComputad<S,Col1,Col2>
where S: FinSet, S::Elem: Clone,
      Col1: Mapping<Dom=S::Elem, Cod=S::Elem>,
      Col2: Mapping<Dom=S::Elem, Cod=Path<S::Elem,S::Elem>> {
    type ValidationError = InvalidColumnarDblComputad<S::Elem>;

    fn iter_invalid(&self) -> impl Iterator<Item = Self::ValidationError> {
        type Invalid<T> = InvalidColumnarDblComputad<T>;

        let edge_graph = EdgeGraph::ref_cast(self);
        let edge_errors = edge_graph.iter_invalid().map(|err| {
            match err {
                InvalidColumnarGraph::Src(e) => Invalid::Dom(e),
                InvalidColumnarGraph::Tgt(e) => Invalid::Cod(e),
            }
        });

        let proedge_graph = ProedgeGraph::ref_cast(self);
        let proedge_errors = proedge_graph.iter_invalid().map(|err| {
            match err {
                InvalidColumnarGraph::Src(e) => Invalid::Src(e),
                InvalidColumnarGraph::Tgt(e) => Invalid::Tgt(e),
            }
        });

        let square_errors = self.square_set.iter().flat_map(|α| {
            let m = self.square_dom_map.apply(&α);
            let n = self.square_cod_map.apply(&α);
            let f = self.square_src_map.apply(&α);
            let g = self.square_tgt_map.apply(&α);
            let mut errs = Vec::new();
            if !m.map_or(false, |path| path.contained_in(proedge_graph)) {
                errs.push(Invalid::SquareDom(α.clone()));
            }
            if !n.map_or(false, |path| path.contained_in(proedge_graph)) {
                errs.push(Invalid::SquareCod(α.clone()));
            }
            if !f.map_or(false, |path| path.contained_in(edge_graph)) {
                errs.push(Invalid::SquareSrc(α.clone()));
            }
            if !g.map_or(false, |path| path.contained_in(edge_graph)) {
                errs.push(Invalid::SquareTgt(α.clone()));
            }
            if errs.is_empty() {
                let (m, n, f, g) = (m.unwrap(), n.unwrap(), f.unwrap(), g.unwrap());
                if !(m.src(proedge_graph) == f.src(edge_graph) &&
                     m.tgt(proedge_graph) == g.src(edge_graph) &&
                     n.src(proedge_graph) == f.tgt(edge_graph) &&
                     n.tgt(proedge_graph) == g.tgt(edge_graph)) {
                    errs.push(Invalid::NotSquare(α));
                }
            }
            errs
        });

        edge_errors.chain(proedge_errors).chain(square_errors)
    }
}

/// The graph of vertices and edges underlying a double computad.
#[derive(From,RefCast)]
#[repr(transparent)]
pub struct EdgeGraph<Cptd: DblComputad>(Cptd);

impl<Cptd: DblComputad> Graph for EdgeGraph<Cptd> {
    type V = Cptd::V;
    type E = Cptd::E;

    fn has_vertex(&self, v: &Self::V) -> bool { self.0.has_vertex(v) }
    fn has_edge(&self, e: &Self::E) -> bool { self.0.has_edge(e) }
    fn src(&self, e: &Self::E) -> Self::V { self.0.dom(e) }
    fn tgt(&self, e: &Self::E) -> Self::V { self.0.cod(e) }
}

impl<Cptd: FinDblComputad> FinGraph for EdgeGraph<Cptd> {
    fn vertices(&self) -> impl Iterator<Item = Self::V> { self.0.vertices() }
    fn edges(&self) -> impl Iterator<Item = Self::E> { self.0.edges() }
}

impl<S,Col1,Col2> Validate for EdgeGraph<ColumnarDblComputad<S,Col1,Col2>>
where S: FinSet, Col1: Mapping<Dom=S::Elem, Cod=S::Elem>,
      ColumnarDblComputad<S,Col1,Col2>: DblComputad {
    type ValidationError = InvalidColumnarGraph<S::Elem>;

    fn iter_invalid(&self) -> impl Iterator<Item = Self::ValidationError> {
        let (eset, vset) = (&self.0.edge_set, &self.0.vertex_set);
        let srcs = self.0.dom_map.iter_invalid_function(eset, vset).map(
            |e| InvalidColumnarGraph::Src(e.take()));
        let tgts = self.0.cod_map.iter_invalid_function(eset, vset).map(
            |e| InvalidColumnarGraph::Tgt(e.take()));
        srcs.chain(tgts)
    }
}

/// The graph of vertices and proedges underlying a double computad.
#[derive(From,RefCast)]
#[repr(transparent)]
pub struct ProedgeGraph<Cptd: DblComputad>(Cptd);

impl<Cptd: DblComputad> Graph for ProedgeGraph<Cptd> {
    type V = Cptd::V;
    type E = Cptd::ProE;

    fn has_vertex(&self, v: &Self::V) -> bool { self.0.has_vertex(v) }
    fn has_edge(&self, e: &Self::E) -> bool { self.0.has_proedge(e) }
    fn src(&self, e: &Self::E) -> Self::V { self.0.src(e) }
    fn tgt(&self, e: &Self::E) -> Self::V { self.0.tgt(e) }
}

impl<Cptd: FinDblComputad> FinGraph for ProedgeGraph<Cptd> {
    fn vertices(&self) -> impl Iterator<Item = Self::V> { self.0.vertices() }
    fn edges(&self) -> impl Iterator<Item = Self::E> { self.0.proedges() }
}

impl<S,Col1,Col2> Validate for ProedgeGraph<ColumnarDblComputad<S,Col1,Col2>>
where S: FinSet, Col1: Mapping<Dom=S::Elem, Cod=S::Elem>,
      ColumnarDblComputad<S,Col1,Col2>: DblComputad {
    type ValidationError = InvalidColumnarGraph<S::Elem>;

    fn iter_invalid(&self) -> impl Iterator<Item = Self::ValidationError> {
        let (eset, vset) = (&self.0.proedge_set, &self.0.vertex_set);
        let srcs = self.0.src_map.iter_invalid_function(eset, vset).map(
            |e| InvalidColumnarGraph::Src(e.take()));
        let tgts = self.0.tgt_map.iter_invalid_function(eset, vset).map(
            |e| InvalidColumnarGraph::Tgt(e.take()));
        srcs.chain(tgts)
    }
}

/// A skeletal, finite double computad.
pub type SkelDblComputad =
    ColumnarDblComputad<SkelFinSet, VecColumn<usize>, VecColumn<SkelPath>>;

impl<Col1,Col2> ColumnarDblComputad<SkelFinSet,Col1,Col2>
where Col1: Mapping<Dom=usize, Cod=usize>,
      Col2: Mapping<Dom=usize, Cod=SkelPath> {
    /// Adds a new vertex to the computad and returns it.
    pub fn add_vertex(&mut self) -> usize {
        self.vertex_set.insert()
    }

    /// Adds a new edge to the computad and returns it.
    pub fn add_edge(&mut self, dom: usize, cod: usize) -> usize {
        let e = self.edge_set.insert();
        self.dom_map.set(e, dom);
        self.cod_map.set(e, cod);
        e
    }

    /// Adds a new edge to the computad and returns it.
    pub fn add_proedge(&mut self, src: usize, tgt: usize) -> usize {
        let p = self.proedge_set.insert();
        self.src_map.set(p, src);
        self.tgt_map.set(p, tgt);
        p
    }

    /// Adds a new square to the computad and returns it.
    pub fn add_square(&mut self, dom: SkelPath, cod: SkelPath,
                    src: SkelPath, tgt: SkelPath) -> usize {
        let α = self.square_set.insert();
        self.square_dom_map.set(α, dom);
        self.square_cod_map.set(α, cod);
        self.square_src_map.set(α, src);
        self.square_tgt_map.set(α, tgt);
        α
    }
}

/// A finite double computad backed by hash sets and hash maps.
pub type HashDblComputad<T> =
    ColumnarDblComputad<HashFinSet<T>, HashColumn<T,T>, HashColumn<T,Path<T,T>>>;

impl<T,Col1,Col2> ColumnarDblComputad<HashFinSet<T>,Col1,Col2>
where T: Eq + Hash + Clone,
      Col1: Mapping<Dom=T, Cod=T>,
      Col2: Mapping<Dom=T, Cod=Path<T,T>> {
    /// Adds a vertex to the computad, returning whether it is new.
    pub fn add_vertex(&mut self, v: T) -> bool {
        self.vertex_set.insert(v)
    }

    /** Adds an edge to the computad, returning whether its is new.

    If the edge is not new, its domain and codomain are updated.
    */
    pub fn add_edge(&mut self, e: T, dom: T, cod: T) -> bool {
        self.dom_map.set(e.clone(), dom);
        self.cod_map.set(e.clone(), cod);
        self.edge_set.insert(e)
    }

    /** Adds a proedge to the computad, returning whether it is new.

    If the proedge is not new, its source and target are updated.
    */
    pub fn add_proedge(&mut self, p: T, src: T, tgt: T) -> bool {
        self.src_map.set(p.clone(), src);
        self.tgt_map.set(p.clone(), tgt);
        self.proedge_set.insert(p)
    }

    /// Adds a square to computad, returning whether it is new.
    pub fn add_square(&mut self, α: T, dom: Path<T,T>, cod: Path<T,T>,
                      src: Path<T,T>, tgt: Path<T,T>) -> bool {
        self.square_dom_map.set(α.clone(), dom);
        self.square_cod_map.set(α.clone(), cod);
        self.square_src_map.set(α.clone(), src);
        self.square_tgt_map.set(α.clone(), tgt);
        self.square_set.insert(α)
    }
}

/** A mapping between double computads.

In the same spirit as mappings between [sets](crate::zero::Mapping) and
[graphs](crate::one::GraphMapping), a computad mapping is like a computad
morphism except that the domain and codomain computads are not specified.
*/
pub trait DblComputadMapping {
    /// Type of vertices in domain computad.
    type DomV: Eq + Clone;
    /// Type of edges in domain computad.
    type DomE: Eq + Clone;
    /// Type of proedges in domain computad.
    type DomProE: Eq + Clone;
    /// Type of squares in domain computad.
    type DomSq: Eq + Clone;

    /// Type of vertices in codomain computad.
    type CodV: Eq + Clone;
    /// Type of edges in codomain computad.
    type CodE: Eq + Clone;
    /// Type of proedges in codomain computad.
    type CodProE: Eq + Clone;
    /// Type of squares in codomain computad.
    type CodSq: Eq + Clone;

    /// Applies the computad mapping at a vertex.
    fn apply_vertex(&self, v: &Self::DomV) -> Option<&Self::CodV>;

    /// Applies the computad mappting at an edge.
    fn apply_edge(&self, e: &Self::DomE) -> Option<&Self::CodE>;

    /// Applies the computad mapping at a proedge.
    fn apply_proedge(&self, p: &Self::DomProE) -> Option<&Self::CodProE>;

    /// Applies the computad mapping at a square.
    fn apply_square(&self, α: &Self::DomSq) -> Option<&Self::CodSq>;

    /// Aplies the computad mapping to a path of edges.
    fn apply_edge_path(&self, path: Path<Self::DomV, Self::DomE>
    ) -> Option<Path<Self::CodV, Self::CodE>> {
        path.try_map(|v| self.apply_vertex(&v).cloned(),
                     |e| self.apply_edge(&e).cloned())
    }

    /// Aplies the computad mapping to a path of proedges.
    fn apply_proedge_path(&self, path: Path<Self::DomV, Self::DomProE>
    ) -> Option<Path<Self::CodV, Self::CodProE>> {
        path.try_map(|v| self.apply_vertex(&v).cloned(),
                     |p| self.apply_proedge(&p).cloned())
    }

    /// Validates that the mapping is a morphism between the two computads.
    fn validate_is_morphism<Dom, Cod>(
        &self,
        dom: &Dom,
        cod: &Cod
    ) -> Result<(), NonEmpty<InvalidDblComputadMorphism<
            Self::DomV, Self::DomE, Self::DomProE, Self::DomSq>>>
    where Self: Sized,
          Dom: FinDblComputad<V=Self::DomV, E=Self::DomE, ProE=Self::DomProE, Sq=Self::DomSq>,
          Cod: DblComputad<V=Self::CodV, E=Self::CodE, ProE=Self::CodProE, Sq=Self::CodSq> {
        validate::collect_errors(self.iter_invalid_morphism(dom, cod))
    }

    /// Iterates over failures of the mapping to be a computad morphism.
    fn iter_invalid_morphism<Dom, Cod>(
        &self,
        dom: &Dom,
        cod: &Cod
    ) -> impl Iterator<Item = InvalidDblComputadMorphism<
            Self::DomV, Self::DomE, Self::DomProE, Self::DomSq>>
    where Self: Sized,
          Dom: FinDblComputad<V=Self::DomV, E=Self::DomE, ProE=Self::DomProE, Sq=Self::DomSq>,
          Cod: DblComputad<V=Self::CodV, E=Self::CodE, ProE=Self::CodProE, Sq=Self::CodSq> {
        type Invalid<V,E,ProE,Sq> = InvalidDblComputadMorphism<V,E,ProE,Sq>;

        let mapping = EdgeGraphMapping::ref_cast(self);
        let edge_errors = mapping.iter_invalid_morphism(
            EdgeGraph::ref_cast(dom),
            EdgeGraph::ref_cast(cod)).map(|err| {
                match err {
                    InvalidGraphMorphism::Vertex(v) => Invalid::Vertex(v),
                    InvalidGraphMorphism::Edge(e) => Invalid::Edge(e),
                    InvalidGraphMorphism::Src(e) => Invalid::Dom(e),
                    InvalidGraphMorphism::Tgt(e) => Invalid::Cod(e),
                }
            });

        let mapping = ProedgeGraphMapping::ref_cast(self);
        let proedge_errors = mapping.iter_invalid_morphism(
            ProedgeGraph::ref_cast(dom),
            ProedgeGraph::ref_cast(cod)).filter_map(|err| {
                match err {
                    InvalidGraphMorphism::Vertex(_) => None, // Already caught.
                    InvalidGraphMorphism::Edge(p) => Some(Invalid::Proedge(p)),
                    InvalidGraphMorphism::Src(p) => Some(Invalid::Src(p)),
                    InvalidGraphMorphism::Tgt(p) => Some(Invalid::Tgt(p)),
                }
            });

        let square_errors = dom.squares().flat_map(|α| {
            if let Some(β) = self.apply_square(&α) {
                if cod.has_square(β) {
                    let mut errs = Vec::new();
                    if !self.apply_proedge_path(dom.square_dom(&α))
                           .map_or(true, |path| path == cod.square_dom(β)) {
                        errs.push(Invalid::SquareDom(α.clone()));
                    }
                    if !self.apply_proedge_path(dom.square_cod(&α))
                           .map_or(true, |path| path == cod.square_cod(β)) {
                        errs.push(Invalid::SquareCod(α.clone()));
                    }
                    if !self.apply_edge_path(dom.square_src(&α))
                           .map_or(true, |path| path == cod.square_src(β)) {
                        errs.push(Invalid::SquareSrc(α.clone()));
                    }
                    if !self.apply_edge_path(dom.square_tgt(&α))
                           .map_or(true, |path| path == cod.square_tgt(β)) {
                        errs.push(Invalid::SquareTgt(α.clone()));
                    }
                    return errs
                }
            }
            vec![Invalid::Square(α)]
        });

        edge_errors.chain(proedge_errors).chain(square_errors)
    }
}

/// A failure of a [mapping](DblComputadMapping) between double computads to be
/// a well-defined morphism.
#[derive(Debug,Error)]
pub enum InvalidDblComputadMorphism<V,E,ProE,Sq> {
    /// A vertex in the domain computad not mapped to a vertex in the codomain.
    #[error("Vertex `{0}` is not mapped to a vertex in the codomain")]
    Vertex(V),

    /// An edge in the domain computad not mapped to an edge in the codomain.
    #[error("Edge `{0}` is not mapped to an edge in the codomain")]
    Edge(E),

    /// A proedge in the domain computad not mapped to a proedge in the codomain.
    #[error("Proedge `{0}` is not mapped to a proedge in the codomain")]
    Proedge(ProE),

    /// A square in the domain computad not mapped to a square in the codomain.
    #[error("Square `{0}` is not mapped to a square in the codomain")]
    Square(Sq),

    /// An edge in the domain computad whose domain is not preserved.
    #[error("Mapping of edge `{0}` does not preserve its domain")]
    Dom(E),

    /// An edge in the domain computad whose codomain is not preserved.
    #[error("Mapping of edge `{0}` does not preserve its codomain")]
    Cod(E),

    /// A proedge in the domain computad whose source is not preserved.
    #[error("Mapping of proedge `{0}` does not preserve its source")]
    Src(ProE),

    /// A proedge in the domain computad whose target is not preserved.
    #[error("Mapping of proedge `{0}` does not preserve its target")]
    Tgt(ProE),

    /// A square in the domain computad whose domain is not preserved.
    #[error("Mapping of square `{0}` does not preserve its domain")]
    SquareDom(Sq),

    /// A square in the domain computad whose codomain is not preserved.
    #[error("Mapping of square `{0}` does not preserve its codomain")]
    SquareCod(Sq),

    /// A square in the domain computad whose source is not preserved.
    #[error("Mapping of square `{0}` does not preserve its source")]
    SquareSrc(Sq),

    /// A square in the domain computad whose target is not preserved.
    #[error("Mapping of square `{0}` does not preserve its target")]
    SquareTgt(Sq),
}

/// Mapping between [edge-graphs](EdgeGraph) underlying double computads.
#[derive(From,RefCast)]
#[repr(transparent)]
pub struct EdgeGraphMapping<M: DblComputadMapping>(M);

impl<M: DblComputadMapping> GraphMapping for EdgeGraphMapping<M> {
    type DomV = M::DomV;
    type DomE = M::DomE;
    type CodV = M::CodV;
    type CodE = M::CodE;

    fn apply_vertex(&self, v: &Self::DomV) -> Option<&Self::CodV> {
        self.0.apply_vertex(v)
    }
    fn apply_edge(&self, e: &Self::DomE) -> Option<&Self::CodE> {
        self.0.apply_edge(e)
    }
}

/// Mapping between [proedge-graphs](ProedgeGraph) underlying double computads.
#[derive(From,RefCast)]
#[repr(transparent)]
pub struct ProedgeGraphMapping<M: DblComputadMapping>(M);

impl<M: DblComputadMapping> GraphMapping for ProedgeGraphMapping<M> {
    type DomV = M::DomV;
    type DomE = M::DomProE;
    type CodV = M::CodV;
    type CodE = M::CodProE;

    fn apply_vertex(&self, v: &Self::DomV) -> Option<&Self::CodV> {
        self.0.apply_vertex(v)
    }
    fn apply_edge(&self, e: &Self::DomE) -> Option<&Self::CodE> {
        self.0.apply_proedge(e)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skel_dbl_computad() {
        // The signature for monads (Lambert & Patterson 2024, Theory 3.8).
        let mut sig_monad: SkelDblComputad = Default::default();
        let x = sig_monad.add_vertex();
        let t = sig_monad.add_edge(x, x);
        let μ = sig_monad.add_square(Path::Id(x), Path::Id(x),
                                     Path::pair(t,t), Path::single(t));
        let _η = sig_monad.add_square(Path::Id(x), Path::Id(x),
                                      Path::Id(x), Path::single(t));
        assert_eq!(sig_monad.square_dom(&μ), Path::Id(x));
        assert_eq!(sig_monad.square_cod(&μ), Path::Id(x));
        assert_eq!(sig_monad.square_src(&μ).len(), 2);
        assert_eq!(sig_monad.square_tgt(&μ).len(), 1);
        assert!(sig_monad.validate().is_ok());
    }

    #[test]
    fn hash_dbl_computad() {
        let mut sig_monad: HashDblComputad<char> = Default::default();
        assert!(sig_monad.add_vertex('x'));
        assert!(sig_monad.add_edge('t', 'x', 'x'));
        sig_monad.add_square('μ', Path::Id('x'), Path::Id('x'),
                             Path::pair('t','t'), Path::single('t'));
        sig_monad.add_square('η', Path::Id('x'), Path::Id('x'),
                             Path::Id('x'), Path::single('t'));
        assert_eq!(sig_monad.square_dom(&'μ'), Path::Id('x'));
        assert_eq!(sig_monad.square_cod(&'μ'), Path::Id('x'));
        assert_eq!(sig_monad.square_src(&'μ').len(), 2);
        assert_eq!(sig_monad.square_tgt(&'μ').len(), 1);
        assert!(sig_monad.validate().is_ok());

    }
}
