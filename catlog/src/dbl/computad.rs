/*! Double computads: interfaces and data structures.

Double computads are like double graphs (two-dimensional cubical sets) except
that the boundaries of cells can be paths of arbitrary finite length instead
just single edges. A double computad is the most general data that generates a
free double category.

Though the term "double computad" is not standard, it is the obvious analogue
for double categories of a [2-computad](https://ncatlab.org/nlab/show/computad),
the generating data for a free 2-category or bicategory. Double computads have
also been called "double signatures" (Delpeuch 2020, Definition 2.1). They are
the special case of "double derivation schemes" where the categories of objects
and arrows, and of objects and proarrows, are free categories (Fiore et al 2008,
Definition 3.3).

## References

- Fiore, Paoli, Pronk, 2008: Model structures on the category of small double
  categories ([arXiv](https://arxiv.org/abs/0711.0473))
- Delpeuch, 2020: The word problem for double categories
  ([arXiv](https://arxiv.org/abs/1907.09927))
*/

use ref_cast::RefCast;
use thiserror::Error;

use crate::validate::Validate;
use crate::zero::set::*;
use crate::zero::column::*;
use crate::one::graph::*;
use crate::one::path::Path;

/** A double computad, the generating data for a free double category.
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

    /// Type of cells in the computad.
    type Cell: Eq;

    /// Does the vertex belong to the computad?
    fn has_vertex(&self, v: &Self::V) -> bool;

    /// Does the edge belong to the computad?
    fn has_edge(&self, e: &Self::E) -> bool;

    /// Does the proedge belong to the computad?
    fn has_proedge(&self, p: &Self::ProE) -> bool;

    /// Does the cell belong to the comptuad?
    fn has_cell(&self, α: &Self::Cell) -> bool;

    /// Gets the domain of an edge.
    fn dom(&self, e: &Self::E) -> Self::V;

    /// Gets the codomain of an edge.
    fn cod(&self, e: &Self::E) -> Self::V;

    /// Gets the source of a proedge.
    fn src(&self, p: &Self::ProE) -> Self::V;

    /// Gets the target of a proedge.
    fn tgt(&self, p: &Self::ProE) -> Self::V;

    /// Gets the domain of a cell, which is a path of proedges.
    fn cell_dom(&self, α: &Self::Cell) -> Path<Self::V, Self::ProE>;

    /// Gets the codomain of a cell, which is a path of proedges.
    fn cell_cod(&self, α: &Self::Cell) -> Path<Self::V, Self::ProE>;

    /// Gets the source of a cell, which is a path of edges.
    fn cell_src(&self, α: &Self::Cell) -> Path<Self::V, Self::E>;

    /// Gets the target of a cell, which is a path of edges.
    fn cell_tgt(&self, α: &Self::Cell) -> Path<Self::V, Self::E>;
}

/** A finite double computad.

Such a double computad has finitely many vertices, edges, proedges, and cells.
 */
pub trait FinDblComputad: DblComputad {
    /// Iterates over vertices in the computad.
    fn vertices(&self) -> impl Iterator<Item = Self::V>;

    /// Iterates over edges in the computad.
    fn edges(&self) -> impl Iterator<Item = Self::E>;

    /// Iterates over proedges in the computad.
    fn proedges(&self) -> impl Iterator<Item = Self::ProE>;

    /// Iterates over cells in the computad.
    fn cells(&self) -> impl Iterator<Item = Self::Cell>;
}

/** A double computad backed by columns.

Sets and columns are assumed to have the same type whenever that makes sense.
There is no reason for this except to avoid an explosion of type parameters.
*/
#[derive(Clone,Default)]
pub struct ColumnarDblComputad<S,Col1,Col2> {
    vertex_set: S, edge_set: S, proedge_set: S, cell_set: S,
    dom_map: Col1, cod_map: Col1, src_map: Col1, tgt_map: Col1,
    cell_dom_map: Col2, cell_cod_map: Col2,
    cell_src_map: Col2, cell_tgt_map: Col2,
}

/// An invalid assignment in a columnar double computad.
#[derive(Debug,Error)]
pub enum ColumnarDblComputadInvalid<T> {
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

    /// Cell with a domain that is not a valid path of proedges.
    #[error("Domain of cell `{0}` is not a path of proedges in the computad")]
    CellDom(T),

    /// Cell with a codomain that is not a valid path of proedges.
    #[error("Codomain of cell `{0}` is not a path of proedges in the computad")]
    CellCod(T),

    /// Cell with a source that is not a valid path of edges.
    #[error("Source of cell `{0}` is not a path of edges in the computad")]
    CellSrc(T),

    /// Cell with a target that is not a valid path of edges.
    #[error("Target of cell `{0}` is not a path of edges in the computad")]
    CellTgt(T),

    /// Cell that is not a square due to failure of compatibility equations.
    #[error("Cell `{0}` is not a square: compatibility equations do not hold")]
    NotSquare(T),
}

impl<S,Col1,Col2> DblComputad for ColumnarDblComputad<S,Col1,Col2>
where S: Set, S::Elem: Clone,
      Col1: Mapping<Dom=S::Elem, Cod=S::Elem>,
      Col2: Mapping<Dom=S::Elem, Cod=Path<S::Elem,S::Elem>> {
    type V = S::Elem;
    type E = S::Elem;
    type ProE = S::Elem;
    type Cell = S::Elem;

    fn has_vertex(&self, v: &Self::V) -> bool { self.vertex_set.contains(v) }
    fn has_edge(&self, e: &Self::E) -> bool { self.edge_set.contains(e) }
    fn has_proedge(&self, p: &Self::ProE) -> bool { self.proedge_set.contains(p) }
    fn has_cell(&self, α: &Self::Cell) -> bool { self.cell_set.contains(α) }

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

    fn cell_dom(&self, α: &Self::Cell) -> Path<Self::V, Self::ProE> {
        self.cell_dom_map.apply(α).expect("Domain of cell should be set").clone()
    }
    fn cell_cod(&self, α: &Self::Cell) -> Path<Self::V, Self::ProE> {
        self.cell_cod_map.apply(α).expect("Codomain of cell should be set").clone()
    }
    fn cell_src(&self, α: &Self::Cell) -> Path<Self::V, Self::E> {
        self.cell_src_map.apply(α).expect("Source of cell should be set").clone()
    }
    fn cell_tgt(&self, α: &Self::Cell) -> Path<Self::V, Self::E> {
        self.cell_tgt_map.apply(α).expect("Target of cell should be set").clone()
    }
}

impl<S,Col1,Col2> FinDblComputad for ColumnarDblComputad<S,Col1,Col2>
where S: FinSet, S::Elem: Clone,
      Col1: Mapping<Dom=S::Elem, Cod=S::Elem>,
      Col2: Mapping<Dom=S::Elem, Cod=Path<S::Elem,S::Elem>> {

    fn vertices(&self) -> impl Iterator<Item=Self::V> { self.vertex_set.iter() }
    fn edges(&self) -> impl Iterator<Item=Self::E> { self.edge_set.iter() }
    fn proedges(&self) -> impl Iterator<Item=Self::ProE> { self.proedge_set.iter() }
    fn cells(&self) -> impl Iterator<Item=Self::Cell> { self.cell_set.iter() }
}

impl<S,Col1,Col2> Validate for ColumnarDblComputad<S,Col1,Col2>
where S: FinSet, S::Elem: Clone,
      Col1: Mapping<Dom=S::Elem, Cod=S::Elem>,
      Col2: Mapping<Dom=S::Elem, Cod=Path<S::Elem,S::Elem>> {
    type ValidationError = ColumnarDblComputadInvalid<S::Elem>;

    fn iter_invalid(&self) -> impl Iterator<Item = Self::ValidationError> {
        type Invalid<T> = ColumnarDblComputadInvalid<T>;

        let edge_graph = EdgeGraph::ref_cast(self);
        let edge_errors = edge_graph.iter_invalid().map(|err| {
            match err {
                ColumnarGraphInvalid::Src(e) => Invalid::Dom(e),
                ColumnarGraphInvalid::Tgt(e) => Invalid::Cod(e),
            }
        });

        let proedge_graph = ProedgeGraph::ref_cast(self);
        let proedge_errors = proedge_graph.iter_invalid().map(|err| {
            match err {
                ColumnarGraphInvalid::Src(e) => Invalid::Src(e),
                ColumnarGraphInvalid::Tgt(e) => Invalid::Tgt(e),
            }
        });

        let cell_errors = self.cell_set.iter().flat_map(|α| {
            let m = self.cell_dom_map.apply(&α);
            let n = self.cell_cod_map.apply(&α);
            let f = self.cell_src_map.apply(&α);
            let g = self.cell_tgt_map.apply(&α);
            let mut errs = Vec::new();
            if !m.map_or(false, |path| path.contained_in(proedge_graph)) {
                errs.push(Invalid::CellDom(α.clone()));
            }
            if !n.map_or(false, |path| path.contained_in(proedge_graph)) {
                errs.push(Invalid::CellCod(α.clone()));
            }
            if !f.map_or(false, |path| path.contained_in(edge_graph)) {
                errs.push(Invalid::CellSrc(α.clone()));
            }
            if !g.map_or(false, |path| path.contained_in(edge_graph)) {
                errs.push(Invalid::CellTgt(α.clone()));
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

        edge_errors.chain(proedge_errors).chain(cell_errors)
    }
}

/// The underlying graph of vertices and edges in a double computad.
#[derive(RefCast)]
#[repr(transparent)]
pub struct EdgeGraph<Cptd>(Cptd);

impl<Cptd> EdgeGraph<Cptd> {
    /// Extracts the underlying graph of the double computad.
    pub fn new(cptd: Cptd) -> Self { Self {0: cptd} }
}

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
where S: FinSet, Col1: Mapping<Dom=S::Elem, Cod=S::Elem> {
    type ValidationError = ColumnarGraphInvalid<S::Elem>;

    fn iter_invalid(&self) -> impl Iterator<Item = Self::ValidationError> {
        let (eset, vset) = (&self.0.edge_set, &self.0.vertex_set);
        let srcs = self.0.dom_map.iter_not_functional(eset, vset).map(
            |e| ColumnarGraphInvalid::Src(e.take()));
        let tgts = self.0.cod_map.iter_not_functional(eset, vset).map(
            |e| ColumnarGraphInvalid::Tgt(e.take()));
        srcs.chain(tgts)
    }
}

/// The underlying graph of vertices and proedges in a double computad.
#[derive(RefCast)]
#[repr(transparent)]
pub struct ProedgeGraph<Cptd>(Cptd);

impl<Cptd> ProedgeGraph<Cptd> {
    /// Extracts the underlying graph of the double computad.
    pub fn new(cptd: Cptd) -> Self { Self {0: cptd} }
}

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
where S: FinSet, Col1: Mapping<Dom=S::Elem, Cod=S::Elem> {
    type ValidationError = ColumnarGraphInvalid<S::Elem>;

    fn iter_invalid(&self) -> impl Iterator<Item = Self::ValidationError> {
        let (eset, vset) = (&self.0.proedge_set, &self.0.vertex_set);
        let srcs = self.0.src_map.iter_not_functional(eset, vset).map(
            |e| ColumnarGraphInvalid::Src(e.take()));
        let tgts = self.0.tgt_map.iter_not_functional(eset, vset).map(
            |e| ColumnarGraphInvalid::Tgt(e.take()));
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

    /// Adds a new cell to the computad and returns it.
    pub fn add_cell(&mut self, dom: SkelPath, cod: SkelPath,
                    src: SkelPath, tgt: SkelPath) -> usize {
        let α = self.cell_set.insert();
        self.cell_dom_map.set(α, dom);
        self.cell_cod_map.set(α, cod);
        self.cell_src_map.set(α, src);
        self.cell_tgt_map.set(α, tgt);
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
        let μ = sig_monad.add_cell(Path::Id(x), Path::Id(x),
                                   Path::pair(t,t), Path::single(t));
        let _η = sig_monad.add_cell(Path::Id(x), Path::Id(x),
                                    Path::Id(x), Path::single(t));
        assert_eq!(sig_monad.cell_dom(&μ), SkelPath::Id(x));
        assert_eq!(sig_monad.cell_cod(&μ), SkelPath::Id(x));
        assert_eq!(sig_monad.cell_src(&μ).len(), 2);
        assert_eq!(sig_monad.cell_tgt(&μ).len(), 1);
        assert!(sig_monad.validate().is_ok());
    }
}
