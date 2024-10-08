/*! Diagrams in double categories.

To be more precise, this module is about *free and finitely generated* double
diagrams, i.e., diagrams in a double category indexed by the free double
category generated by a [finite double computad](FinDblComputad). Equivalently,
such a double diagram is a morphism from a finite double computad, the *diagram
shape* or *indexing computad*, to the double computad underlying a double
category. The latter description is simpler, so that is how we store a double
diagram.

As an object in a Rust, a double diagram knows its shape and typically owns that
data. It does not know or own the target double category/computad. Practically
speaking, this is the main difference between a double diagram and a double
computad [mapping](DblComputadMapping).
 */

use derivative::Derivative;
use nonempty::NonEmpty;

use super::computad::*;
use crate::one::path::SkelPath;
use crate::validate::{self, Validate};
use crate::zero::{AttributedSkelSet, Column, FinSet, Mapping, VecColumn};

/// A diagram in a double category.
pub trait DblDiagram: FinDblComputad {
    /// Type of objects in the target double category.
    type Ob: Eq;
    /// Type of arrows in the target double category.
    type Arr: Eq;
    /// Type of proarrows in the target double category.
    type Pro: Eq;
    /// Type of cells in the target double category.
    type Cell: Eq;

    /// Gets the object indexed by a vertex.
    fn object(&self, v: &Self::V) -> Self::Ob;

    /// Gets the arrow indexed by an edge.
    fn arrow(&self, e: &Self::E) -> Self::Arr;

    /// Gets the proarrow indexed by a proedge.
    fn proarrow(&self, p: &Self::ProE) -> Self::Pro;

    /// Gets the cell indexed by a square.
    fn cell(&self, α: &Self::Sq) -> Self::Cell;
}

/// A double diagram with a skeletal indexing computad.
#[derive(Clone, Derivative)]
#[derivative(Default(bound = ""))]
pub struct SkelDblDiagram<Ob, Arr, Pro, Cell> {
    objects: AttributedSkelSet<Ob>,
    arrows: AttributedSkelSet<Arr>,
    proarrows: AttributedSkelSet<Pro>,
    cells: AttributedSkelSet<Cell>,
    dom_map: VecColumn<usize>,
    cod_map: VecColumn<usize>,
    src_map: VecColumn<usize>,
    tgt_map: VecColumn<usize>,
    sq_dom_map: VecColumn<SkelPath>,
    sq_cod_map: VecColumn<SkelPath>,
    sq_src_map: VecColumn<SkelPath>,
    sq_tgt_map: VecColumn<SkelPath>,
}

impl<Ob, Arr, Pro, Cell> SkelDblDiagram<Ob, Arr, Pro, Cell>
where
    Ob: Eq,
    Arr: Eq,
    Pro: Eq,
    Cell: Eq,
{
    /// Adds an object to the diagram, and returns its indexing vertex.
    pub fn add_object(&mut self, x: Ob) -> usize {
        self.objects.insert(x)
    }

    /// Adds an arrow to the diagram, and returns its indexing edge.
    pub fn add_arrow(&mut self, f: Arr, dom: usize, cod: usize) -> usize {
        let e = self.arrows.insert(f);
        self.dom_map.set(e, dom);
        self.cod_map.set(e, cod);
        e
    }

    /// Adds a proarrow to the diagram, and returns its indexing proedge.
    pub fn add_proarrow(&mut self, m: Pro, src: usize, tgt: usize) -> usize {
        let p = self.proarrows.insert(m);
        self.src_map.set(p, src);
        self.tgt_map.set(p, tgt);
        p
    }

    /// Adds a cell to the diagram, and returns its indexing square.
    pub fn add_cell(
        &mut self,
        α: Cell,
        dom: SkelPath,
        cod: SkelPath,
        src: SkelPath,
        tgt: SkelPath,
    ) -> usize {
        let sq = self.cells.insert(α);
        self.sq_dom_map.set(sq, dom);
        self.sq_cod_map.set(sq, cod);
        self.sq_src_map.set(sq, src);
        self.sq_tgt_map.set(sq, tgt);
        sq
    }
}

impl<Ob, Arr, Pro, Cell> ColumnarDblComputad for SkelDblDiagram<Ob, Arr, Pro, Cell> {
    type V = usize;
    type E = usize;
    type ProE = usize;
    type Sq = usize;

    fn vertex_set(&self) -> &impl FinSet<Elem = usize> {
        &self.objects
    }
    fn edge_set(&self) -> &impl FinSet<Elem = usize> {
        &self.arrows
    }
    fn proedge_set(&self) -> &impl FinSet<Elem = usize> {
        &self.proarrows
    }
    fn square_set(&self) -> &impl FinSet<Elem = usize> {
        &self.cells
    }

    fn dom_map(&self) -> &impl Column<Dom = usize, Cod = usize> {
        &self.dom_map
    }
    fn cod_map(&self) -> &impl Column<Dom = usize, Cod = usize> {
        &self.cod_map
    }
    fn src_map(&self) -> &impl Column<Dom = usize, Cod = usize> {
        &self.src_map
    }
    fn tgt_map(&self) -> &impl Column<Dom = usize, Cod = usize> {
        &self.tgt_map
    }

    fn square_dom_map(&self) -> &impl Column<Dom = usize, Cod = SkelPath> {
        &self.sq_dom_map
    }
    fn square_cod_map(&self) -> &impl Column<Dom = usize, Cod = SkelPath> {
        &self.sq_cod_map
    }
    fn square_src_map(&self) -> &impl Column<Dom = usize, Cod = SkelPath> {
        &self.sq_src_map
    }
    fn square_tgt_map(&self) -> &impl Column<Dom = usize, Cod = SkelPath> {
        &self.sq_tgt_map
    }
}

impl<Ob, Arr, Pro, Cell> DblDiagram for SkelDblDiagram<Ob, Arr, Pro, Cell>
where
    Ob: Eq + Clone,
    Arr: Eq + Clone,
    Pro: Eq + Clone,
    Cell: Eq + Clone,
{
    type Ob = Ob;
    type Arr = Arr;
    type Pro = Pro;
    type Cell = Cell;

    fn object(&self, v: &usize) -> Ob {
        self.objects.view(*v).clone()
    }
    fn arrow(&self, e: &usize) -> Arr {
        self.arrows.view(*e).clone()
    }
    fn proarrow(&self, p: &usize) -> Pro {
        self.proarrows.view(*p).clone()
    }
    fn cell(&self, α: &usize) -> Cell {
        self.cells.view(*α).clone()
    }
}

impl<Ob, Arr, Pro, Cell> Validate for SkelDblDiagram<Ob, Arr, Pro, Cell>
where
    Ob: Eq + Clone,
    Arr: Eq + Clone,
    Pro: Eq + Clone,
    Cell: Eq + Clone,
{
    type ValidationError = InvalidDblComputadData<usize, usize, usize>;

    fn validate(&self) -> Result<(), NonEmpty<Self::ValidationError>> {
        validate::wrap_errors(self.iter_invalid())
    }
}

impl<Ob, Arr, Pro, Cell> DblComputadMapping for SkelDblDiagram<Ob, Arr, Pro, Cell>
where
    Ob: Eq + Clone,
    Arr: Eq + Clone,
    Pro: Eq + Clone,
    Cell: Eq + Clone,
{
    type DomV = usize;
    type DomE = usize;
    type DomProE = usize;
    type DomSq = usize;

    type CodV = Ob;
    type CodE = Arr;
    type CodProE = Pro;
    type CodSq = Cell;

    fn apply_vertex(&self, v: &usize) -> Option<&Ob> {
        Some(self.objects.view(*v))
    }
    fn apply_edge(&self, e: &usize) -> Option<&Arr> {
        Some(self.arrows.view(*e))
    }
    fn apply_proedge(&self, p: &usize) -> Option<&Pro> {
        Some(self.proarrows.view(*p))
    }
    fn apply_square(&self, α: &usize) -> Option<&Cell> {
        Some(self.cells.view(*α))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::one::path::Path;
    use crate::validate::Validate;

    #[test]
    fn skel_dbl_diagram() {
        // Formula for general restriction in an equipment ([Lambert & Patterson
        // 2024](crate::refs::CartDblTheories), Equation 4.7).
        let mut cptd: HashDblComputad<&str, &str, &str, &str> = Default::default();
        cptd.add_vertices(["w", "x", "y", "z"]);
        cptd.add_edge("f", "x", "w");
        cptd.add_edge("g", "y", "z");
        cptd.add_proedge("f!", "x", "w");
        cptd.add_proedge("g*", "z", "y");
        cptd.add_proedge("n", "w", "z");
        cptd.add_square(
            "f_res",
            Path::single("f!"),
            Path::Id("w"),
            Path::single("f"),
            Path::Id("w"),
        );
        cptd.add_square(
            "g_res",
            Path::single("g*"),
            Path::Id("z"),
            Path::Id("z"),
            Path::single("g"),
        );
        assert!(cptd.validate().is_ok());

        let mut diag: SkelDblDiagram<&str, &str, &str, &str> = Default::default();
        let (w, x) = (diag.add_object("w"), diag.add_object("x"));
        let (y, z) = (diag.add_object("y"), diag.add_object("z"));
        let (f, g) = (diag.add_arrow("f", x, w), diag.add_arrow("g", y, z));
        let fcmp = diag.add_proarrow("f!", x, w);
        let gcnj = diag.add_proarrow("g*", z, y);
        diag.add_proarrow("n", w, z);
        diag.add_cell("f_res", Path::single(fcmp), Path::Id(w), Path::single(f), Path::Id(w));
        diag.add_cell("g_res", Path::single(gcnj), Path::Id(z), Path::Id(z), Path::single(g));
        assert!(diag.validate().is_ok());
        assert!(DblComputadMorphism(&diag, &diag, &cptd).validate().is_ok());
    }
}
