/*! Modal double theories.

TODO: Explain implementation strategy.
*/

use std::hash::{BuildHasher, Hash, RandomState};

use ref_cast::RefCast;

use crate::dbl::computad::{AVDCComputad, AVDCComputadSquares};
use crate::dbl::{DblTree, VDblCategory, VDblGraph};
use crate::one::computad::{Computad, ComputadEdges};
use crate::{one::*, zero::*};

/** Modes/modalities available in a modal double theory.

On the semantics side, each of these corresponds to a lax double monad on the
double category of sets.
 */
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    /// Lists of objects and morphisms (of same length).
    List,

    /// Lists of objects and morphisms with permutation of codomain list.
    SymList,

    /// Lists of objects and morphisms with reindexing of codomain list.
    Fam,

    /// Lists of objects and morphisms with reindexing of domain list..
    ProdFam,

    /// Lists of objects and morphisms with independent reindexing of both
    /// domain and codomain lists.
    BiprodFam,
}

/** Application of modes/modalities.

Due to the simplicity of this logic, we can easily put terms in normal form:
every term is a generator with a list (possibly empty) of modes applied to it.
 */
#[derive(Clone, PartialEq, Eq)]
pub struct ModeApp<T> {
    arg: T,
    modes: Vec<Mode>,
}

impl<T> ModeApp<T> {
    fn apply(mut self, modes: Vec<Mode>) -> Self {
        self.modes.extend(modes);
        self
    }
}

/// An object type in a modal double theory.
pub type ModalObType<Id> = ModeApp<Id>;

/// A morphism type in a modal double theory.
pub type ModalMorType<Id> = ShortPath<ModalObType<Id>, ModeApp<Id>>;

impl<Id> ModalMorType<Id> {
    fn apply_modes(self, modes: Vec<Mode>) -> Self {
        match self {
            ShortPath::Zero(x) => ShortPath::Zero(x.apply(modes)),
            ShortPath::One(f) => ShortPath::One(f.apply(modes)),
        }
    }
}

/// An object operation in a modal double theory.
type ModalObOp<Id> = Path<ModalObType<Id>, ModeApp<Id>>;

impl<Id> ModalObOp<Id> {
    fn apply_modes(self, modes: Vec<Mode>) -> Self {
        match self {
            Path::Id(x) => Path::Id(x.apply(modes)),
            Path::Seq(edges) => Path::Seq(edges.map(|p| p.apply(modes.clone()))),
        }
    }
}

/// TODO
#[derive(Clone, PartialEq, Eq)]
pub enum Square<Id> {
    /// Generating square.
    Generator(Id),

    /// Square witnessing a composite.
    Composite(Path<ModalObType<Id>, ModalMorType<Id>>),
}

/// A morphism operation in a modal double theory.
type ModalMorOp<Id> = DblTree<ModalObOp<Id>, ModalMorType<Id>, ModeApp<Square<Id>>>;

/// A modal double theory.
pub struct ModalDblTheory<Id, S = RandomState> {
    ob_generators: HashFinSet<Id, S>,
    arr_generators: ComputadEdges<ModalObType<Id>, Id, S>,
    pro_generators: ComputadEdges<ModalObType<Id>, Id, S>,
    cell_generators: AVDCComputadSquares<ModalObType<Id>, ModalObOp<Id>, ModalMorType<Id>, Id, S>,
    // TODO: Arrow equations, cell equations, composites
    //arr_equations: Vec<PathEq<ModalObType<Id>, ModeApp<Id>>>,
}

/// Set of object types in a modal double theory.
#[derive(RefCast)]
#[repr(transparent)]
struct ModalSet<Id, S>(HashFinSet<Id, S>);

impl<Id, S> Set for ModalSet<Id, S>
where
    Id: Eq + Clone + Hash,
    S: BuildHasher,
{
    type Elem = ModeApp<Id>;

    fn contains(&self, ob: &Self::Elem) -> bool {
        self.0.contains(&ob.arg)
    }
}

/// Graph of basic object operations or morphism types in a modal double theory.
struct ModalGraph<'a, Id, S>(&'a HashFinSet<Id, S>, &'a ComputadEdges<ModeApp<Id>, Id, S>);

impl<'a, Id, S> ModalGraph<'a, Id, S>
where
    Id: Eq + Clone + Hash,
    S: BuildHasher,
{
    fn for_ob_ops(th: &'a ModalDblTheory<Id, S>) -> Self {
        ModalGraph(&th.ob_generators, &th.arr_generators)
    }
    fn for_mor_types(th: &'a ModalDblTheory<Id, S>) -> Self {
        ModalGraph(&th.ob_generators, &th.pro_generators)
    }
    fn computad(&self) -> impl ColumnarGraph<V = ModeApp<Id>, E = Id> {
        Computad(ModalSet::ref_cast(self.0), self.1)
    }
}

impl<'a, Id, S> Graph for ModalGraph<'a, Id, S>
where
    Id: Eq + Clone + Hash,
    S: BuildHasher,
{
    type V = ModeApp<Id>;
    type E = ModeApp<Id>;

    fn has_vertex(&self, x: &Self::V) -> bool {
        ModalSet::ref_cast(self.0).contains(x)
    }
    fn has_edge(&self, f: &Self::E) -> bool {
        self.computad().has_edge(&f.arg)
    }
    fn src(&self, f: &Self::E) -> Self::V {
        self.computad().src(&f.arg).apply(f.modes.clone())
    }
    fn tgt(&self, f: &Self::E) -> Self::V {
        self.computad().tgt(&f.arg).apply(f.modes.clone())
    }
}

/// Category of object types/operations in a modal double theory.
#[derive(RefCast)]
#[repr(transparent)]
struct ModalOneTheory<Id, S>(ModalDblTheory<Id, S>);

impl<Id, S> Category for ModalOneTheory<Id, S>
where
    Id: Eq + Clone + Hash,
    S: BuildHasher,
{
    type Ob = ModalObType<Id>;
    type Mor = ModalObOp<Id>;

    fn has_ob(&self, x: &Self::Ob) -> bool {
        ModalGraph::for_ob_ops(&self.0).has_vertex(x)
    }
    fn has_mor(&self, path: &Self::Mor) -> bool {
        path.contained_in(&ModalGraph::for_ob_ops(&self.0))
    }
    fn dom(&self, path: &Self::Mor) -> Self::Ob {
        path.src(&ModalGraph::for_ob_ops(&self.0))
    }
    fn cod(&self, path: &Self::Mor) -> Self::Ob {
        path.tgt(&ModalGraph::for_ob_ops(&self.0))
    }
    fn compose(&self, path: Path<Self::Ob, Self::Mor>) -> Self::Mor {
        path.flatten()
    }
}

/// Graph of object/morphism types in a modal double theory.
#[derive(RefCast)]
#[repr(transparent)]
struct ModalMorTypeGraph<Id, S>(ModalDblTheory<Id, S>);

impl<Id, S> Graph for ModalMorTypeGraph<Id, S>
where
    Id: Eq + Clone + Hash,
    S: BuildHasher,
{
    type V = ModalObType<Id>;
    type E = ModalMorType<Id>;

    fn has_vertex(&self, x: &Self::V) -> bool {
        ModalGraph::for_mor_types(&self.0).has_vertex(x)
    }
    fn has_edge(&self, path: &Self::E) -> bool {
        path.contained_in(&ModalGraph::for_mor_types(&self.0))
    }
    fn src(&self, path: &Self::E) -> Self::V {
        path.src(&ModalGraph::for_mor_types(&self.0))
    }
    fn tgt(&self, path: &Self::E) -> Self::V {
        path.tgt(&ModalGraph::for_mor_types(&self.0))
    }
}

impl<Id, S> ReflexiveGraph for ModalMorTypeGraph<Id, S>
where
    Id: Eq + Clone + Hash,
    S: BuildHasher,
{
    fn refl(&self, x: Self::V) -> Self::E {
        ShortPath::Zero(x)
    }
}

#[derive(RefCast)]
#[repr(transparent)]
struct ModalVDblGraph<Id, S>(ModalDblTheory<Id, S>);

impl<Id, S> VDblGraph for ModalVDblGraph<Id, S>
where
    Id: Eq + Clone + Hash,
    S: BuildHasher,
{
    type V = ModalObType<Id>;
    type E = ModalObOp<Id>;
    type ProE = ModalMorType<Id>;
    type Sq = ModeApp<Square<Id>>;

    fn has_vertex(&self, x: &Self::V) -> bool {
        ModalSet::ref_cast(&self.0.ob_generators).contains(x)
    }
    fn has_edge(&self, path: &Self::E) -> bool {
        ModalOneTheory::ref_cast(&self.0).has_mor(path)
    }
    fn has_proedge(&self, path: &Self::ProE) -> bool {
        ModalMorTypeGraph::ref_cast(&self.0).has_edge(path)
    }
    fn has_square(&self, sq: &Self::Sq) -> bool {
        match &sq.arg {
            Square::Generator(sq) => self.0.cell_generators.squares.contains(sq),
            // FIXME: Don't assume all composites exist.
            Square::Composite(_) => true,
        }
    }

    fn dom(&self, path: &Self::E) -> Self::V {
        ModalOneTheory::ref_cast(&self.0).dom(path)
    }
    fn cod(&self, path: &Self::E) -> Self::V {
        ModalOneTheory::ref_cast(&self.0).cod(path)
    }
    fn src(&self, path: &Self::ProE) -> Self::V {
        ModalMorTypeGraph::ref_cast(&self.0).src(path)
    }
    fn tgt(&self, path: &Self::ProE) -> Self::V {
        ModalMorTypeGraph::ref_cast(&self.0).tgt(path)
    }

    fn square_dom(&self, sq: &Self::Sq) -> Path<Self::V, Self::ProE> {
        let dom = match &sq.arg {
            Square::Generator(sq) => self.0.computad().square_dom(sq),
            Square::Composite(path) => path.clone(),
        };
        dom.map(|x| x.apply(sq.modes.clone()), |p| p.apply_modes(sq.modes.clone()))
    }
    fn square_cod(&self, sq: &Self::Sq) -> Self::ProE {
        let cod = match &sq.arg {
            Square::Generator(sq) => self.0.computad().square_cod(sq),
            Square::Composite(_) => panic!("Composites not implemented"),
        };
        cod.apply_modes(sq.modes.clone())
    }
    fn square_src(&self, sq: &Self::Sq) -> Self::E {
        let src = match &sq.arg {
            Square::Generator(sq) => self.0.computad().square_src(sq),
            Square::Composite(path) => Path::empty(path.src(ModalMorTypeGraph::ref_cast(&self.0))),
        };
        src.apply_modes(sq.modes.clone())
    }
    fn square_tgt(&self, sq: &Self::Sq) -> Self::E {
        let tgt = match &sq.arg {
            Square::Generator(sq) => self.0.computad().square_tgt(sq),
            Square::Composite(path) => Path::empty(path.tgt(ModalMorTypeGraph::ref_cast(&self.0))),
        };
        tgt.apply_modes(sq.modes.clone())
    }
    fn arity(&self, sq: &Self::Sq) -> usize {
        match &sq.arg {
            Square::Generator(sq) => self.0.computad().arity(sq),
            Square::Composite(path) => path.len(),
        }
    }
}

impl<Id, S> ModalDblTheory<Id, S>
where
    Id: Eq + Clone + Hash,
    S: BuildHasher,
{
    fn computad(
        &self,
    ) -> impl VDblGraph<V = ModalObType<Id>, E = ModalObOp<Id>, ProE = ModalMorType<Id>, Sq = Id>
    {
        AVDCComputad {
            objects: ModalSet::ref_cast(&self.ob_generators),
            arrows: UnderlyingGraph::ref_cast(ModalOneTheory::ref_cast(self)),
            proarrows: ModalMorTypeGraph::ref_cast(self),
            computad: &self.cell_generators,
        }
    }
}

impl<Id, S> VDblCategory for ModalDblTheory<Id, S>
where
    Id: Eq + Clone + Hash,
    S: BuildHasher,
{
    type Ob = ModalObType<Id>;
    type Arr = ModalObOp<Id>;
    type Pro = ModalMorType<Id>;
    type Cell = ModalMorOp<Id>;

    fn has_ob(&self, x: &Self::Ob) -> bool {
        ModalVDblGraph::ref_cast(self).has_vertex(x)
    }
    fn has_arrow(&self, f: &Self::Arr) -> bool {
        ModalVDblGraph::ref_cast(self).has_edge(f)
    }
    fn has_proarrow(&self, m: &Self::Pro) -> bool {
        ModalVDblGraph::ref_cast(self).has_proedge(m)
    }
    fn has_cell(&self, tree: &Self::Cell) -> bool {
        tree.contained_in(ModalVDblGraph::ref_cast(self))
    }

    fn dom(&self, f: &Self::Arr) -> Self::Ob {
        ModalVDblGraph::ref_cast(self).dom(f)
    }
    fn cod(&self, f: &Self::Arr) -> Self::Ob {
        ModalVDblGraph::ref_cast(self).cod(f)
    }
    fn src(&self, m: &Self::Pro) -> Self::Ob {
        ModalVDblGraph::ref_cast(self).src(m)
    }
    fn tgt(&self, m: &Self::Pro) -> Self::Ob {
        ModalVDblGraph::ref_cast(self).tgt(m)
    }

    fn cell_dom(&self, tree: &Self::Cell) -> Path<Self::Ob, Self::Pro> {
        tree.dom(ModalVDblGraph::ref_cast(self))
    }
    fn cell_cod(&self, tree: &Self::Cell) -> Self::Pro {
        tree.cod(ModalVDblGraph::ref_cast(self))
    }
    fn cell_src(&self, tree: &Self::Cell) -> Self::Arr {
        self.compose(tree.src(ModalVDblGraph::ref_cast(self)))
    }
    fn cell_tgt(&self, tree: &Self::Cell) -> Self::Arr {
        self.compose(tree.tgt(ModalVDblGraph::ref_cast(self)))
    }
    fn arity(&self, tree: &Self::Cell) -> usize {
        tree.arity(ModalVDblGraph::ref_cast(self))
    }

    fn compose(&self, path: Path<Self::Ob, Self::Arr>) -> Self::Arr {
        ModalOneTheory::ref_cast(self).compose(path)
    }
    fn compose_cells(&self, tree: DblTree<Self::Arr, Self::Pro, Self::Cell>) -> Self::Cell {
        tree.flatten()
    }
}
