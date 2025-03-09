/*! Virtual double categories.

# Background

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
are not strictly unique if they exist but they *are* unique up to unique
isomorphism. As often when working with (co)limits, our trait for virtual double
categories assumes that a *choice* of composites has been made whenever they are
needed. We do not attempt to "recognize" whether an arbitrary cell has the
relevant universal property.

Virtual double categories have pros and cons compared with ordinary double
categories. We prefer VDCs in `catlog` because pastings of cells are much
simpler in a VDC than in a double category: a pasting diagram in VDC is a
well-typed [tree](super::tree) of cells, rather than a kind of planar string
diagram, and the notorious
[pinwheel](https://ncatlab.org/nlab/show/double+category#Unbiased) obstruction
to composition in a double category does not arise.

# Examples

A [double theory](super::theory) is "just" a unital virtual double category, so
any double theory in the standard library is an example of a VDC. For testing
purposes, this module provides several minimal examples of VDCs implemented
directly, namely ["walking"](https://ncatlab.org/nlab/show/walking+structure)
categorical structures that can be interpreted in any VDC:

- the [walking category](WalkingCategory)
- the [walking functor](WalkingFunctor)
- the [walking bimodule](WalkingBimodule) or profunctor

The walking category and bimodule can be seen as discrete double theories, while
the walking functor is a simple double theory, but here they are implemented at
the type level rather than as instances of general data structures.
 */

use derive_more::From;
use ref_cast::RefCast;

use super::graph::VDblGraph;
use super::tree::DblTree;
use crate::one::path::Path;

/** A virtual double category (VDC).

See the [module-level docs](super::category) for background on VDCs.

TODO: The universal property of a composite is not part of the interface.
 */
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

    /** Gets the arity of a cell.

    The default implementation returns the length of the cell's domain.
     */
    fn arity(&self, cell: &Self::Cell) -> usize {
        self.cell_dom(cell).len()
    }

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
        self.compose_cells(DblTree::two_level(αs, β))
    }

    /// Constructs the identity cell on a proarrow.
    fn id_cell(&self, m: Self::Pro) -> Self::Cell {
        self.compose_cells(DblTree::empty(m))
    }

    /** Does the path of proarrows have a chosen composite?

    The default implementation checks whether [`composite`](Self::composite)
    returns something.
    */
    fn has_composite(&self, path: &Path<Self::Ob, Self::Pro>) -> bool {
        self.composite(path.clone()).is_some()
    }

    /** Does the object have a chosen unit?

    The default implementation checks whether [`unit`](Self::unit) returns
    something.
     */
    fn has_unit(&self, x: &Self::Ob) -> bool {
        self.unit(x.clone()).is_some()
    }

    /** Gets the chosen cell witnessing a composite of proarrows, if there is one.

    Such a cell is called an **extension or **opcartesian** cell.

    The default implementation handles the one special kind of composite that
    always exist: unary composites.
     */
    fn composite_ext(&self, path: Path<Self::Ob, Self::Pro>) -> Option<Self::Cell> {
        path.only().map(|m| self.id_cell(m))
    }

    /// Gets the chosen cell witnessing a composite of two proarrows, if there is one.
    fn composite2_ext(&self, m: Self::Pro, n: Self::Pro) -> Option<Self::Cell> {
        self.composite_ext(Path::pair(m, n))
    }

    /// Gets the chosen composite for a path of proarrows, if there is one.
    fn composite(&self, path: Path<Self::Ob, Self::Pro>) -> Option<Self::Pro> {
        self.composite_ext(path).map(|α| self.cell_cod(&α))
    }

    /// Gets the chosen composite for a pair of consecutive proarrows, if there is one.
    fn composite2(&self, m: Self::Pro, n: Self::Pro) -> Option<Self::Pro> {
        self.composite(Path::pair(m, n))
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
pub struct UnderlyingDblGraph<VDC: VDblCategory>(pub VDC);

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
    fn arity(&self, sq: &Self::Sq) -> usize {
        self.0.arity(sq)
    }
}

/** The walking category as a VDC.

The walking category is the simplest example of a virtual double category that
has units (and in fact all composites). Specifically, the **walking category**
is the unital VDC freely generated by a single object, here called `()`.

The concept of a category can be interpreted in any virtual double category: a
**category object** in a VDC is a functor from the walking category into that
VDC. In particular, a category object in spans is a category in the ordinary
sense.
 */
pub struct WalkingCategory();

impl VDblCategory for WalkingCategory {
    type Ob = ();
    type Arr = ();
    type Pro = ();
    type Cell = usize;

    fn has_ob(&self, _: &Self::Ob) -> bool {
        true
    }
    fn has_arrow(&self, _: &Self::Arr) -> bool {
        true
    }
    fn has_proarrow(&self, _: &Self::Pro) -> bool {
        true
    }
    fn has_cell(&self, _: &Self::Cell) -> bool {
        true
    }

    fn dom(&self, _: &Self::Arr) -> Self::Ob {}
    fn cod(&self, _: &Self::Arr) -> Self::Ob {}
    fn src(&self, _: &Self::Pro) -> Self::Ob {}
    fn tgt(&self, _: &Self::Pro) -> Self::Ob {}

    fn cell_dom(&self, n: &Self::Cell) -> Path<Self::Ob, Self::Pro> {
        Path::repeat_n((), (), *n)
    }
    fn cell_cod(&self, _: &Self::Cell) -> Self::Pro {}
    fn cell_src(&self, _: &Self::Cell) -> Self::Arr {}
    fn cell_tgt(&self, _: &Self::Cell) -> Self::Arr {}

    fn compose(&self, _: Path<Self::Ob, Self::Arr>) -> Self::Arr {}
    fn compose_cells(&self, tree: DblTree<Self::Arr, Self::Pro, Self::Cell>) -> Self::Cell {
        tree.dom(UnderlyingDblGraph::ref_cast(self)).len()
    }
    fn composite_ext(&self, path: Path<Self::Ob, Self::Pro>) -> Option<Self::Cell> {
        Some(path.len())
    }
}

#[allow(non_snake_case)]
pub mod WalkingBimodule {
    /*! The walking bimodule as a VDC.

    The **walking bimodule**, also known as the **walking profunctor**, is the
    unital virtual double category freely generated by a pair of objects, here
    called [`Left`](Ob::Left) and [`Right`](Ob::Right), and a single proarrow
    between them, here called [`Middle`](Pro::Middle). In fact, this VDC has all
    composites.
    */
    use super::super::graph::ProedgeGraph;
    use super::*;

    /// Struct representing the walking bimodule.
    pub struct Main();

    /// Type of objects in the walking bimodule.
    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub enum Ob {
        /// Object representing the source of the bimodule.
        Left,
        /// Object representing the target of the bimodule.
        Right,
    }

    /// Type of proarrows in the walking bimodule.
    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub enum Pro {
        /// Unit proarrow on the object [`Left`](Ob::Left).
        Left,
        /// Generating proarrow from [`Left`](Ob::Left) to [`Right`](Ob::Right).
        Middle,
        /// Unit proarrow on the object [`Right`](Ob::Right).
        Right,
    }

    impl Pro {
        fn src(self) -> Ob {
            match self {
                Pro::Left => Ob::Left,
                Pro::Middle => Ob::Left,
                Pro::Right => Ob::Right,
            }
        }

        fn tgt(self) -> Ob {
            match self {
                Pro::Left => Ob::Left,
                Pro::Middle => Ob::Right,
                Pro::Right => Ob::Right,
            }
        }
    }

    impl VDblCategory for Main {
        type Ob = Ob;
        type Arr = Ob;
        type Pro = Pro;
        type Cell = Path<Ob, Pro>;

        fn has_ob(&self, _: &Self::Ob) -> bool {
            true
        }
        fn has_arrow(&self, _: &Self::Arr) -> bool {
            true
        }
        fn has_proarrow(&self, _: &Self::Pro) -> bool {
            true
        }
        fn has_cell(&self, path: &Path<Ob, Pro>) -> bool {
            path.contained_in(ProedgeGraph::ref_cast(UnderlyingDblGraph::ref_cast(self)))
        }

        fn dom(&self, f: &Self::Arr) -> Self::Ob {
            *f
        }
        fn cod(&self, f: &Self::Arr) -> Self::Ob {
            *f
        }
        fn src(&self, m: &Self::Pro) -> Self::Ob {
            m.src()
        }
        fn tgt(&self, m: &Self::Pro) -> Self::Ob {
            m.tgt()
        }

        fn cell_dom(&self, path: &Path<Ob, Pro>) -> Path<Self::Ob, Self::Pro> {
            path.clone()
        }
        fn cell_cod(&self, path: &Path<Ob, Pro>) -> Self::Pro {
            assert!(self.has_cell(path));
            match path {
                Path::Id(Ob::Left) => Pro::Left,
                Path::Id(Ob::Right) => Pro::Right,
                Path::Seq(pros) => {
                    *pros.iter().find(|m| **m == Pro::Middle).unwrap_or_else(|| pros.first())
                }
            }
        }
        fn cell_src(&self, path: &Path<Ob, Pro>) -> Self::Arr {
            path.src(ProedgeGraph::ref_cast(UnderlyingDblGraph::ref_cast(self)))
        }
        fn cell_tgt(&self, path: &Path<Ob, Pro>) -> Self::Arr {
            path.tgt(ProedgeGraph::ref_cast(UnderlyingDblGraph::ref_cast(self)))
        }

        fn compose(&self, path: Path<Self::Ob, Self::Arr>) -> Self::Arr {
            match path {
                Path::Id(x) => x,
                Path::Seq(arrows) => *arrows.first(),
            }
        }
        fn compose_cells(&self, tree: DblTree<Self::Arr, Self::Pro, Self::Cell>) -> Self::Cell {
            let path = tree.dom(UnderlyingDblGraph::ref_cast(self));
            assert!(self.has_cell(&path));
            path
        }
        fn composite_ext(&self, path: Path<Self::Ob, Self::Pro>) -> Option<Self::Cell> {
            Some(path)
        }
    }
}

#[allow(non_snake_case)]
pub mod WalkingFunctor {
    /*! The walking functor as a VDC.

    The **walking functor** is the unital virtual double category freely
    generated by a pair of objects, here called [`Zero`](Ob::Zero) and
    [`One`](Ob::One), and a single arrow between them.
     */
    use super::super::graph::{EdgeGraph, ProedgeGraph};
    use super::*;

    /// Struct representing the walking functor.
    pub struct Main();

    /// Type of objects in the walking functor.
    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub enum Ob {
        /// Object representing the domain of the functor.
        Zero,
        /// Object representing the codomain of the functor.
        One,
    }

    /// Type of arrows in the walking functor.
    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub enum Arr {
        /// Identity arrow on the object [`Zero`](Ob::Zero).
        Zero,
        /// Identity arrow on the object [`One`](Ob::One).
        One,
        /// Generating arrow from [`Zero`](Ob::Zero) to [`One`](Ob::One).
        Arrow,
    }

    impl Arr {
        fn dom(self) -> Ob {
            match self {
                Arr::Zero => Ob::Zero,
                Arr::Arrow => Ob::Zero,
                Arr::One => Ob::One,
            }
        }

        fn cod(self) -> Ob {
            match self {
                Arr::Zero => Ob::Zero,
                Arr::Arrow => Ob::One,
                Arr::One => Ob::One,
            }
        }
    }

    /// Type of cells in the walking functor.
    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub enum Cell {
        /// Cell bounded by identity arrows on the object [`Zero`](Ob::Zero).
        Zero(usize),
        /// Cell bounded by identity arrows on the object [`One`](Ob::One).
        One(usize),
        /// Cell bounded by the generating arrow.
        Arrow(usize),
    }

    impl Cell {
        fn with_src_and_tgt(f: Arr, n: usize) -> Self {
            match f {
                Arr::Zero => Cell::Zero(n),
                Arr::Arrow => Cell::Arrow(n),
                Arr::One => Cell::One(n),
            }
        }

        fn dom(self) -> Path<Ob, Ob> {
            let (ob, n) = match self {
                Cell::Zero(n) => (Ob::Zero, n),
                Cell::Arrow(n) => (Ob::Zero, n),
                Cell::One(n) => (Ob::One, n),
            };
            Path::repeat_n(ob, ob, n)
        }

        fn cod(self) -> Ob {
            match self {
                Cell::Zero(_) => Ob::Zero,
                Cell::Arrow(_) => Ob::One,
                Cell::One(_) => Ob::One,
            }
        }

        fn src(self) -> Arr {
            match self {
                Cell::Zero(_) => Arr::Zero,
                Cell::Arrow(_) => Arr::Arrow,
                Cell::One(_) => Arr::One,
            }
        }

        fn tgt(self) -> Arr {
            self.src()
        }
    }

    impl VDblCategory for Main {
        type Ob = Ob;
        type Arr = Arr;
        type Pro = Ob;
        type Cell = Cell;

        fn has_ob(&self, _: &Self::Ob) -> bool {
            true
        }
        fn has_arrow(&self, _: &Self::Arr) -> bool {
            true
        }
        fn has_proarrow(&self, _: &Self::Pro) -> bool {
            true
        }
        fn has_cell(&self, _: &Self::Cell) -> bool {
            true
        }

        fn dom(&self, f: &Self::Arr) -> Self::Ob {
            f.dom()
        }
        fn cod(&self, f: &Self::Arr) -> Self::Ob {
            f.cod()
        }
        fn src(&self, m: &Self::Pro) -> Self::Ob {
            *m
        }
        fn tgt(&self, m: &Self::Pro) -> Self::Ob {
            *m
        }

        fn cell_dom(&self, cell: &Self::Cell) -> Path<Self::Ob, Self::Pro> {
            cell.dom()
        }
        fn cell_cod(&self, cell: &Self::Cell) -> Self::Pro {
            cell.cod()
        }
        fn cell_src(&self, cell: &Self::Cell) -> Self::Arr {
            cell.src()
        }
        fn cell_tgt(&self, cell: &Self::Cell) -> Self::Arr {
            cell.tgt()
        }

        fn compose(&self, path: Path<Self::Ob, Self::Arr>) -> Self::Arr {
            assert!(path.contained_in(EdgeGraph::ref_cast(UnderlyingDblGraph::ref_cast(self))));
            match path {
                Path::Id(Ob::Zero) => Arr::Zero,
                Path::Id(Ob::One) => Arr::One,
                Path::Seq(arrows) => {
                    *arrows.iter().find(|f| **f == Arr::Arrow).unwrap_or_else(|| arrows.first())
                }
            }
        }
        fn compose_cells(&self, tree: DblTree<Self::Arr, Self::Pro, Self::Cell>) -> Self::Cell {
            let graph = UnderlyingDblGraph::ref_cast(self);
            let n = tree.arity(graph);
            let (f, g) = (self.compose(tree.src(graph)), self.compose(tree.tgt(graph)));
            assert_eq!(f, g, "Cells in walking functor have the same source and target");
            Cell::with_src_and_tgt(f, n)
        }
        fn composite_ext(&self, path: Path<Self::Ob, Self::Pro>) -> Option<Self::Cell> {
            let graph = ProedgeGraph::ref_cast(UnderlyingDblGraph::ref_cast(self));
            let (x, y) = (path.src(graph), path.tgt(graph));
            assert_eq!(x, y, "Paths in walking functor have the same source and target");
            Some(Cell::with_src_and_tgt(self.id(x), path.len()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn walking_category() {
        let vdc = WalkingCategory();
        assert!(vdc.has_unit(&()));
        assert_eq!(vdc.unit(()), Some(()));
        assert_eq!(vdc.unit_ext(()), Some(0));
        assert_eq!(vdc.cell_dom(&0), Path::empty(()));
        assert_eq!(vdc.cell_dom(&2), Path::pair((), ()));
    }

    #[test]
    fn walking_bimodule() {
        use WalkingBimodule::{Ob, Pro};

        let vdc = WalkingBimodule::Main();
        assert!(vdc.has_unit(&Ob::Left));
        assert_eq!(vdc.unit(Ob::Left), Some(Pro::Left));
        let ext = vdc.unit_ext(Ob::Left).unwrap();
        assert_eq!(vdc.cell_dom(&ext), Path::empty(Ob::Left));
        assert_eq!(vdc.cell_cod(&ext), Pro::Left);

        let path = Path::from_vec(vec![Pro::Left, Pro::Middle, Pro::Right]).unwrap();
        assert!(vdc.has_cell(&Path::single(Pro::Middle)));
        assert!(vdc.has_cell(&path));
        assert!(!vdc.has_cell(&Path::pair(Pro::Left, Pro::Right)));
        assert_eq!(vdc.composite(Path::empty(Ob::Left)), Some(Pro::Left));
        assert_eq!(vdc.composite(Path::empty(Ob::Right)), Some(Pro::Right));
        assert_eq!(vdc.composite(path), Some(Pro::Middle));
    }

    #[test]
    fn walking_functor() {
        use WalkingFunctor::{Arr, Cell, Ob};

        let vdc = WalkingFunctor::Main();
        let cell = Cell::Arrow(2);
        assert_eq!(vdc.cell_dom(&cell), Path::pair(Ob::Zero, Ob::Zero));
        assert_eq!(vdc.cell_cod(&cell), Ob::One);
        assert_eq!(vdc.cell_src(&cell), Arr::Arrow);
        assert_eq!(vdc.cell_tgt(&cell), Arr::Arrow);

        let ext = vdc.composite_ext(Path::pair(Ob::Zero, Ob::Zero)).unwrap();
        assert_eq!(vdc.cell_src(&ext), Arr::Zero);
        assert_eq!(vdc.cell_tgt(&ext), Arr::Zero);
        let new_cell = vdc.compose_cells2(vec![ext, ext], cell);
        assert_eq!(vdc.cell_dom(&new_cell).len(), 4);
    }
}
