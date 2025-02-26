/*! Virtual double categories.

A [*virtual double
category*](https://ncatlab.org/nlab/show/virtual+double+category) (VDC) is like
a double category, except that there is no external composition operation on
proarrows or cells. Rather, a cell has a domain that is a path of proarrows (a
"virtual" composite). The name "virtual double category" was introduced by
[Cruttwell and Shulman](crate::refs::GeneralizedMulticategories) but the concept
has gone by many other names, notably *fc-multicategory* ([Leinster
2004](crate::refs::HigherOperads)).

*Composites* of proarrows in a VDC, if they exist, are represented by cells
satisfying a universal property ([Cruttwell-Shulman
2008](crate::refs::GeneralizedMulticategories), Section 5). In our usage of
virtual double categories as double theories, we will assume that *units*
(nullary composites) exist. We will not assume that any other composites exist,
though they often do. Like anything defined by a universal property, composites
are not strictly unique but they *are* unique up to unique isomorphism. As often
when working with (co)limits, our trait for virtual double categories assumes
that a *choice* of composites has been made whenever they are needed. We do not
attempt to "recognize" whether an arbitrary cell has the relevant universal
property.

Virtual double categories have pros and cons compared with ordinary double
categories. We prefer VDCs in `catlog` because pastings of cells are much
simpler in a VDC than in a double category: a pasting diagram in VDC is a
well-typed [tree](super::tree) of cells, rather than a kind of planar string
diagram, and the notorious
[pinwheel](https://ncatlab.org/nlab/show/double+category#Unbiased) obstruction
to composition in a double category does not arise.
 */

use derive_more::From;
use ref_cast::RefCast;

use super::graph::VDblGraph;
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

    /** Gets the chosen extension cell for a path of proarrows, if there is one.

    Such a cell is also called an **opcartesian** cell. The default
    implementation handles the one special case of a composite that always
    exists: a unary composite.
     */
    fn composite_ext(&self, path: Path<Self::Ob, Self::Pro>) -> Option<Self::Cell> {
        path.only().map(|m| self.id_cell(m))
    }

    /// Gets the chosen composite for a path of proarrows, if there is one.
    fn composite(&self, path: Path<Self::Ob, Self::Pro>) -> Option<Self::Pro> {
        self.composite_ext(path).map(|α| self.cell_cod(&α))
    }

    /** Gets the chosen extension cell for an object, if there is one.

    Such a cell is an [extension](Self::composite_ext) or opcartesian cell
    in the nullary case.
     */
    fn unit_ext(&self, x: Self::Ob) -> Option<Self::Cell> {
        self.composite_ext(Path::empty(x))
    }

    /// Gets the chosen unit for an object, if there is one.
    fn unit(&self, x: Self::Ob) -> Option<Self::Pro> {
        self.unit_ext(x).map(|α| self.cell_cod(&α))
    }
}

/// The underlying [virtual double graph](VDblGraph) of a VDC.
#[derive(From, RefCast)]
#[repr(transparent)]
pub struct UnderlyingDblGraph<VDC: VDblCategory>(VDC);

impl<VDC: VDblCategory> VDblGraph for UnderlyingDblGraph<VDC> {
    type V = VDC::Ob;
    type E = VDC::Arr;
    type ProE = VDC::Pro;
    type Sq = VDC::Cell;

    fn has_vertex(&self, v: &Self::V) -> bool {
        self.0.has_ob(v)
    }
    fn has_edge(&self, e: &Self::E) -> bool {
        self.0.has_arrow(e)
    }
    fn has_proedge(&self, p: &Self::ProE) -> bool {
        self.0.has_proarrow(p)
    }
    fn has_square(&self, sq: &Self::Sq) -> bool {
        self.0.has_cell(sq)
    }

    fn dom(&self, e: &Self::E) -> Self::V {
        self.0.dom(e)
    }
    fn cod(&self, e: &Self::E) -> Self::V {
        self.0.cod(e)
    }
    fn src(&self, p: &Self::ProE) -> Self::V {
        self.0.src(p)
    }
    fn tgt(&self, p: &Self::ProE) -> Self::V {
        self.0.tgt(p)
    }

    fn square_dom(&self, sq: &Self::Sq) -> Path<Self::V, Self::ProE> {
        self.0.cell_dom(sq)
    }
    fn square_cod(&self, sq: &Self::Sq) -> Self::ProE {
        self.0.cell_cod(sq)
    }
    fn square_src(&self, sq: &Self::Sq) -> Self::E {
        self.0.cell_src(sq)
    }
    fn square_tgt(&self, sq: &Self::Sq) -> Self::E {
        self.0.cell_tgt(sq)
    }
}
