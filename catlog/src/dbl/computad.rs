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

use derive_more::From;
use ref_cast::RefCast;
use thiserror::Error;

use crate::validate::Validate;
use crate::zero::*;
use crate::one::{Graph, FinGraph, Path, InvalidColumnarGraph};

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

    /// Sq with a domain that is not a valid path of proedges.
    #[error("Domain of square `{0}` is not a path of proedges in the computad")]
    SqDom(T),

    /// Sq with a codomain that is not a valid path of proedges.
    #[error("Codomain of square `{0}` is not a path of proedges in the computad")]
    SqCod(T),

    /// Sq with a source that is not a valid path of edges.
    #[error("Source of square `{0}` is not a path of edges in the computad")]
    SqSrc(T),

    /// Sq with a target that is not a valid path of edges.
    #[error("Target of square `{0}` is not a path of edges in the computad")]
    SqTgt(T),

    /// Sq that is not square-shaped due to failure of compatibility equations.
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
                errs.push(Invalid::SqDom(α.clone()));
            }
            if !n.map_or(false, |path| path.contained_in(proedge_graph)) {
                errs.push(Invalid::SqCod(α.clone()));
            }
            if !f.map_or(false, |path| path.contained_in(edge_graph)) {
                errs.push(Invalid::SqSrc(α.clone()));
            }
            if !g.map_or(false, |path| path.contained_in(edge_graph)) {
                errs.push(Invalid::SqTgt(α.clone()));
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
            errs.into_iter()
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

/// A path in a graph with skeletal vertex and edge sets.
type SkelPath = Path<usize, usize>;

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
        assert_eq!(sig_monad.square_dom(&μ), SkelPath::Id(x));
        assert_eq!(sig_monad.square_cod(&μ), SkelPath::Id(x));
        assert_eq!(sig_monad.square_src(&μ).len(), 2);
        assert_eq!(sig_monad.square_tgt(&μ).len(), 1);
        assert!(sig_monad.validate().is_ok());
    }
}
