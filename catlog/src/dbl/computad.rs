//! Double computads, the most general analogue of graphs for double categories.

use crate::set::{Set, FinSet};
use crate::column::*;
use crate::category::Path;

/** A double computad.

Double computads are like double graphs (two-dimensional cubical sets) except
that the boundaries of cells can be paths of arbitrary finite length instead
just single edges. A double computad is the most general data that generates a
free double category. Though the term "double computad" is not standard, it is
the obvious analogue for double categories of a
[2-computad](https://ncatlab.org/nlab/show/computad) for 2-categories or
bicategories.
 */
pub trait DblComputad {
    /// Type of vertices in the computad, generating objects in a double
    /// category.
    type V;

    /// Type of edges in the computad, generating arrows in a double category.
    type E;

    /// Type of "pro-edges" in the computad, generating proarrows in a double
    /// category.
    type ProE;

    /// Type of cells in the computad.
    type Cell;

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
pub struct ColumnarDblComputad<S,Col1,Col2> {
    vertex_set: S, edge_set: S, proedge_set: S, cell_set: S,
    dom_map: Col1, cod_map: Col1, src_map: Col1, tgt_map: Col1,
    cell_dom_map: Col2, cell_cod_map: Col2,
    cell_src_map: Col2, cell_tgt_map: Col2,
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
      Col1: Column<Dom=S::Elem, Cod=S::Elem>,
      Col2: Column<Dom=S::Elem, Cod=Path<S::Elem,S::Elem>> {

    fn vertices(&self) -> impl Iterator<Item=Self::V> { self.vertex_set.iter() }
    fn edges(&self) -> impl Iterator<Item=Self::E> { self.edge_set.iter() }
    fn proedges(&self) -> impl Iterator<Item=Self::ProE> { self.proedge_set.iter() }
    fn cells(&self) -> impl Iterator<Item=Self::Cell> { self.cell_set.iter() }
}
