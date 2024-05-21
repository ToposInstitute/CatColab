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
        let mut cptd: HashDblComputad<char> = Default::default();
        cptd.add_vertex('x'); cptd.add_vertex('y'); cptd.add_vertex('z');
        cptd.add_edge('f', 'x', 'x'); cptd.add_edge('g', 'z', 'z');
        cptd.add_proedge('m', 'x', 'y'); cptd.add_proedge('n', 'y', 'z');
        cptd.add_square('α', Path::single('m'), Path::single('m'),
                        Path::single('f'), Path::Id('y'));
        cptd.add_square('β', Path::single('n'), Path::single('n'),
                        Path::Id('y'), Path::single('g'));
        assert!(cptd.validate().is_ok());

        let mut diag: SkelDblDiagram<char,char,char,char> = Default::default();
        let (x1, x2) = (diag.add_object('x'), diag.add_object('x'));
        let y = diag.add_object('y');
        let (z1, z2) = (diag.add_object('z'), diag.add_object('z'));
        let (f, g) = (diag.add_arrow('f', x1, x2), diag.add_arrow('g', z1, z2));
        let (m1, m2) = (diag.add_proarrow('m', x1, y), diag.add_proarrow('m', x2, y));
        let (n1, n2) = (diag.add_proarrow('n', y, z1), diag.add_proarrow('n', y, z2));
        diag.add_cell('α', Path::single(m1), Path::single(m2),
                      Path::single(f), Path::Id(y));
        diag.add_cell('β', Path::single(n1), Path::single(n2),
                      Path::Id(y), Path::single(g));
        assert!(diag.validate_is_morphism(diag.shape(), &cptd).is_ok());
    }
}
