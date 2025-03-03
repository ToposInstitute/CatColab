/*! Virtual double categories.

A [*virtual double
category*](https://ncatlab.org/nlab/show/virtual+double+category) (VDC) is like
a double category, except that there is no external composition operation on
proarrows or cells. Rather, a cell has a domain that is a path of proarrows (a
"virtual" composite). The name "virtual double category" was introduced by
[Cruttwell and Shulman](crate::refs::GeneralizedMulticategories) but the concept
has gone by many other names, notably *fc-multicategory* ([Leinster
2004](crate::refs::HigherOperads)).

Virtual double categories have pros and cons compared with ordinary double
categories. We prefer VDCs in `catlog` because pastings of cells are much
simpler in a VDC than in a double category: a pasting diagram in VDC is a
well-typed [tree](super::tree) of cells, rather than a kind of planar string
diagram, and the notorious
[pinwheel](https://ncatlab.org/nlab/show/double+category#Unbiased) obstruction
to composition does not arise.
 */

use super::tree::DblTree;
use crate::one::path::Path;

/// A virtual double category (VDC).
pub trait VDblCategory {
    /// Type of objects in the VDC.
    type Ob: Eq + Clone;

    /// Type of arrows (tight morphisms) in the VDC.
    type Arr: Eq + Clone;

    /// Type of proarrows (loose morphisms) in the VDC.
    type Pro: Eq + Clone;

    /// Type of cells in the VDC;
    type Cell: Eq + Clone;

    /// Does the object belong to the VDC?
    fn has_ob(&self, ob: &Self::Ob) -> bool;

    /// Does the arrow belong to the VDC?
    fn has_arrow(&self, arr: &Self::Arr) -> bool;

    /// Does the proarrow belong to the VDC?
    fn has_proarrow(&self, pro: &Self::Pro) -> bool;

    /// Does the cell belong to the VDC?
    fn has_cell(&self, cell: &Self::Cell) -> bool;

    /// Gets the domain of an arrow.
    fn dom(&self, f: &Self::Arr) -> Self::Ob;

    /// Gets the codomain of an arrow.
    fn cod(&self, f: &Self::Arr) -> Self::Ob;

    /// Gets the source of a proarrow.
    fn src(&self, m: &Self::Pro) -> Self::Ob;

    /// Gets the target of a proarrow.
    fn tgt(&self, m: &Self::Pro) -> Self::Ob;

    /// Gets the domain of a cell, a path of proarrows.
    fn cell_dom(&self, cell: &Self::Cell) -> Path<Self::Ob, Self::Pro>;

    /// Gets the codomain of a cell, a single proarrow.
    fn cell_cod(&self, cell: &Self::Cell) -> Self::Pro;

    /// Gets the source of a cell, an arrow.
    fn cell_src(&self, cell: &Self::Cell) -> Self::Arr;

    /// Gets the target of a cell, an edge.
    fn cell_tgt(&self, cell: &Self::Cell) -> Self::Arr;

    /// Composes a path of arrows in the VDC.
    fn compose(&self, path: Path<Self::Ob, Self::Arr>) -> Self::Arr;

    /// Composes a pair of arrows with compatible (co)domains.
    fn compose2(&self, f: Self::Arr, g: Self::Arr) -> Self::Arr {
        self.compose(Path::pair(f, g))
    }

    /// Constructs the identity arrow at an object.
    fn id(&self, x: Self::Ob) -> Self::Arr {
        self.compose(Path::empty(x))
    }

    /// Composes a tree of cells in the VDC.
    fn compose_cells(&self, tree: DblTree<Self::Arr, Self::Pro, Self::Cell>) -> Self::Cell;

    /// Composes a two-layer pasting of cells.
    fn compose_cells2(
        &self,
        αs: impl IntoIterator<Item = Self::Cell>,
        β: Self::Cell,
    ) -> Self::Cell {
        self.compose_cells(DblTree::graft(αs.into_iter().map(DblTree::single), β))
    }

    /// Constructs the identity cell on a proarrow.
    fn id_cell(&self, m: Self::Pro) -> Self::Cell {
        self.compose_cells(DblTree::empty(m))
    }
}
