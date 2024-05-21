/*! Diagrams in double categories.

To be more precise, this module is about *free and finitely generated* double
diagrams, i.e., diagrams in a double category indexed by a free double category
on a [finite double computad](FinDblComputad). Equivalently, by the adjunction,
such a diagram is a morphism from a finite double computad to the double
computad underlying a double category. Double diagrams are stored in the latter
form, as it is simpler.

As an object in a Rust, a double diagram knows its [shape](DblDiagram::shape)
(indexing computad) and owns that data. It does not know or own the target
double category/computad. Practically speaking, this is the main difference
between a double diagram and a double computad [mapping](DblComputadMapping).
 */

use nonempty::NonEmpty;

use crate::validate;
use crate::zero::{Mapping, VecColumn};
use crate::one::path::SkelPath;
use super::computad::*;

/// A diagram in a double category.
pub trait DblDiagram {
    /// Type of vertices in the indexing computad.
    type V: Eq;
    /// Type of edges in the indexing computad.
    type E: Eq;
    /// Type of proedges in the indexing computad.
    type ProE: Eq;
    /// Type of squares in the indexing computad.
    type Sq: Eq;

    /// Type of objects in the target double category.
    type Ob: Eq;
    /// Type of arrows in the target double category.
    type Arr: Eq;
    /// Type of proarrows in the target double category.
    type Pro: Eq;
    /// Type of cells in the target double category.
    type Cell: Eq;

    /// Type of the diagram shape (indexing double computad).
    type Shape: FinDblComputad<
            V = Self::V, E = Self::E, ProE = Self::ProE, Sq = Self::Sq>;

    /// Gets the shape of the double diagram.
    fn shape<'a>(&'a self) -> &'a Self::Shape;

    /// Gets the object indexed by a vertex.
    fn object(&self, v: &Self::V) -> Self::Ob;

    /// Gets the arrow indexed by an edge.
    fn arrow(&self, e: &Self::E) -> Self::Arr;

    /// Gets the proarrow indexed by a proedge.
    fn proarrow(&self, p: &Self::ProE) -> Self::Pro;

    /// Gets the cell indexed by a square.
    fn cell(&self, α: &Self::Sq) -> Self::Cell;
}

/// A double diagram indexed by a skeletal double computad.
#[derive(Clone,Default)]
pub struct SkelDblDiagram<Ob, Arr, Pro, Cell> {
    shape: SkelDblComputad,
    object_map: VecColumn<Ob>,
    arrow_map: VecColumn<Arr>,
    proarrow_map: VecColumn<Pro>,
    cell_map: VecColumn<Cell>
}

impl<Ob,Arr,Pro,Cell> SkelDblDiagram<Ob,Arr,Pro,Cell>
where Ob: Eq, Arr: Eq, Pro: Eq, Cell: Eq {
    /// Adds an object to the diagram, and returns its indexing vertex.
    pub fn add_object(&mut self, x: Ob) -> usize {
        let v = self.shape.add_vertex();
        self.object_map.set(v, x);
        v
    }

    /// Adds an arrow to the diagram, and returns its indexing edge.
    pub fn add_arrow(&mut self, f: Arr, dom: usize, cod: usize) -> usize {
        let e = self.shape.add_edge(dom, cod);
        self.arrow_map.set(e, f);
        e
    }

    /// Adds a proarrow to the diagram, and returns its indexing proedge.
    pub fn add_proarrow(&mut self, m: Pro, src: usize, tgt: usize) -> usize {
        let p = self.shape.add_proedge(src, tgt);
        self.proarrow_map.set(p, m);
        p
    }

    /// Adds a cell to the diagram, and returns its indexing square.
    pub fn add_cell(&mut self, α: Cell, dom: SkelPath, cod: SkelPath,
                src: SkelPath, tgt: SkelPath) -> usize {
        let sq = self.shape.add_square(dom, cod, src, tgt);
        self.cell_map.set(sq, α);
        sq
    }
}

impl<Ob,Arr,Pro,Cell> SkelDblDiagram<Ob,Arr,Pro,Cell>
where Ob: Eq+Clone, Arr: Eq+Clone, Pro: Eq+Clone, Cell: Eq+Clone {
    /// Validates that diagram is contained in the given computad.
    pub fn validate_in<Cptd>(
        &self,
        cptd: &Cptd
    ) -> Result<(), NonEmpty<InvalidDblComputadMorphism<usize,usize,usize,usize>>>
    where Cptd: DblComputad<V=Ob, E=Arr, ProE=Pro, Sq=Cell> {
        validate::collect_errors(self.iter_invalid_in(cptd))
    }

    /// Iterates over failures of diagram to be contained in the given computad.
    pub fn iter_invalid_in<'a, Cptd>(
        &'a self,
        cptd: &'a Cptd
    ) -> impl Iterator<Item = InvalidDblComputadMorphism<usize,usize,usize,usize>> + 'a
    where Cptd: DblComputad<V=Ob, E=Arr, ProE=Pro, Sq=Cell> {
        self.iter_invalid_morphism(self.shape(), cptd)
    }
}

impl<Ob,Arr,Pro,Cell> DblComputadMapping for SkelDblDiagram<Ob,Arr,Pro,Cell>
where Ob: Eq+Clone, Arr: Eq+Clone, Pro: Eq+Clone, Cell: Eq+Clone {
    type DomV = usize;
    type DomE = usize;
    type DomProE = usize;
    type DomSq = usize;

    type CodV = Ob;
    type CodE = Arr;
    type CodProE = Pro;
    type CodSq = Cell;

    fn apply_vertex(&self, v: &usize) -> Option<&Ob> {
        self.object_map.apply(v)
    }
    fn apply_edge(&self, e: &usize) -> Option<&Arr> {
        self.arrow_map.apply(e)
    }
    fn apply_proedge(&self, p: &usize) -> Option<&Pro> {
        self.proarrow_map.apply(p)
    }
    fn apply_square(&self, α: &usize) -> Option<&Cell> {
        self.cell_map.apply(α)
    }
}

impl<Ob,Arr,Pro,Cell> DblDiagram for SkelDblDiagram<Ob,Arr,Pro,Cell>
where Ob: Eq+Clone, Arr: Eq+Clone, Pro: Eq+Clone, Cell: Eq+Clone {
    type V = usize;
    type E = usize;
    type ProE = usize;
    type Sq = usize;

    type Ob = Ob;
    type Arr = Arr;
    type Pro = Pro;
    type Cell = Cell;

    type Shape = SkelDblComputad;
    fn shape<'a>(&'a self) -> &'a Self::Shape { &self.shape }

    fn object(&self, v: &usize) -> Ob {
        self.apply_vertex(v).expect("Object in diagram should be defined").clone()
    }
    fn arrow(&self, e: &usize) -> Arr {
        self.apply_edge(e).expect("Arrow in diagram should be defined").clone()
    }
    fn proarrow(&self, p: &usize) -> Pro {
        self.apply_proedge(p).expect("Proarrow in diagram should be defined").clone()
    }
    fn cell(&self, α: &usize) -> Cell {
        self.apply_square(α).expect("Cell in diagram should be defined").clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::validate::Validate;
    use crate::one::path::Path;

    #[test]
    fn skel_dbl_diagram() {
        // Formula for general restriction in an equipment (see, for example,
        // Lambert & Patterson 2024, Equation 4.7).
        let mut cptd: HashDblComputad<&str> = Default::default();
        cptd.add_vertices(["w", "x", "y", "z"].into_iter());
        cptd.add_edge("f", "x", "w"); cptd.add_edge("g", "y", "z");
        cptd.add_proedge("f!", "x", "w"); cptd.add_proedge("g*", "z", "y");
        cptd.add_proedge("n", "w", "z");
        cptd.add_square("f_res", Path::single("f!"), Path::Id("w"),
                        Path::single("f"), Path::Id("w"));
        cptd.add_square("g_res", Path::single("g*"), Path::Id("z"),
                        Path::Id("z"), Path::single("g"));
        assert!(cptd.validate().is_ok());

        let mut diag: SkelDblDiagram<&str,&str,&str,&str> = Default::default();
        let (w, x) = (diag.add_object("w"), diag.add_object("x"));
        let (y, z) = (diag.add_object("y"), diag.add_object("z"));
        let (f, g) = (diag.add_arrow("f", x, w), diag.add_arrow("g", y, z));
        let fcmp = diag.add_proarrow("f!", x, w);
        let gcnj = diag.add_proarrow("g*", z, y);
        diag.add_proarrow("n", w, z);
        diag.add_cell("f_res", Path::single(fcmp), Path::Id(w),
                      Path::single(f), Path::Id(w));
        diag.add_cell("g_res", Path::single(gcnj), Path::Id(z),
                      Path::Id(z), Path::single(g));
        assert!(diag.validate_in(&cptd).is_ok());
    }
}
