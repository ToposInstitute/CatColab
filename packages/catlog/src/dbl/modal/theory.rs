/*! Modal double theories.

TODO: Explain implementation strategy.
*/

use std::hash::{BuildHasher, BuildHasherDefault, Hash, RandomState};
use std::iter::repeat_n;

use derive_more::From;
use ref_cast::RefCast;
use ustr::{IdentityHasher, Ustr};

use crate::dbl::computad::{AVDCComputad, AVDCComputadTop};
use crate::dbl::{DblTree, InvalidVDblGraph, VDblCategory, VDblGraph};
use crate::one::computad::{Computad, ComputadTop};
use crate::validate::{self, Validate};
use crate::{one::*, zero::*};

/** Modes/modalities available in a modal double theory.

On the semantics side, each of these corresponds to a lax double monad on the
double category of sets.
 */
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
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
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ModeApp<T> {
    arg: T,
    modes: Vec<Mode>,
}

impl<T> ModeApp<T> {
    /// Constructs a new term with no modes applied.
    pub fn new(arg: T) -> Self {
        Self {
            arg,
            modes: Vec::new(),
        }
    }

    /** Converts from `&ModeApp<T>` to `ModeApp<&T>`.

    Note that this requires cloning the list of applied modes.
    */
    pub fn as_ref(&self) -> ModeApp<&T> {
        ModeApp {
            arg: &self.arg,
            modes: self.modes.clone(),
        }
    }

    /// Applies a mode.
    pub fn apply(mut self, mode: Mode) -> Self {
        self.modes.push(mode);
        self
    }

    /// Applies a sequence of modes.
    pub fn apply_all(mut self, modes: impl IntoIterator<Item = Mode>) -> Self {
        self.modes.extend(modes);
        self
    }

    /// Maps over the argument.
    pub fn map<S, F: FnOnce(T) -> S>(self, f: F) -> ModeApp<S> {
        let ModeApp { arg, modes } = self;
        ModeApp { arg: f(arg), modes }
    }

    /// Maps over the argument, flattening nested applications.
    pub fn flat_map<S, F: FnOnce(T) -> ModeApp<S>>(self, f: F) -> ModeApp<S> {
        let ModeApp { arg, modes } = self;
        f(arg).apply_all(modes)
    }
}

/// An object type in a modal double theory.
pub type ModalObType<Id> = ModeApp<Id>;

/// A morphism type in a modal double theory.
pub type ModalMorType<Id> = ShortPath<ModalObType<Id>, ModeApp<Id>>;

impl<Id> ModalMorType<Id> {
    fn apply_all(self, modes: impl IntoIterator<Item = Mode>) -> Self {
        match self {
            ShortPath::Zero(x) => ShortPath::Zero(x.apply_all(modes)),
            ShortPath::One(f) => ShortPath::One(f.apply_all(modes)),
        }
    }
}

/// A basic object operation in a modal double theory.
#[derive(Clone, Debug, PartialEq, Eq, From)]
pub enum ModalEdge<Id> {
    /// Generating operation.
    #[from]
    Generator(Id),

    /// Component of monad multiplication at given object type.
    Mul(Mode, usize, ModalObType<Id>),
}

/// An object operation in a modal double theory.
type ModalObOp<Id> = Path<ModalObType<Id>, ModeApp<ModalEdge<Id>>>;

impl<Id> ModalObOp<Id> {
    fn apply_all(self, modes: impl IntoIterator<Item = Mode> + Clone) -> Self {
        match self {
            Path::Id(x) => Path::Id(x.apply_all(modes)),
            Path::Seq(edges) => Path::Seq(edges.map(|p| p.apply_all(modes.clone()))),
        }
    }
}

/// A basic morphism operation in a modal double theory.
#[derive(Clone, PartialEq, Eq, From)]
pub enum ModalSquare<Id> {
    /// Generating operation.
    #[from]
    Generator(Id),

    /// Component of monad multiplication at given morphism type.
    Mul(Mode, usize, ModeApp<Id>),

    /// Square witnessing a composite.
    Composite(Path<ModalObType<Id>, ModalMorType<Id>>),
}

/// A morphism operation in a modal double theory.
type ModalMorOp<Id> = DblTree<ModalObOp<Id>, ModalMorType<Id>, ModeApp<ModalSquare<Id>>>;

/// A modal double theory.
#[derive(Debug, Default)]
pub struct ModalDblTheory<Id, S = RandomState> {
    ob_generators: HashFinSet<Id, S>,
    arr_generators: ComputadTop<ModalObType<Id>, Id, S>,
    pro_generators: ComputadTop<ModalObType<Id>, Id, S>,
    cell_generators: AVDCComputadTop<ModalObType<Id>, ModalObOp<Id>, ModalMorType<Id>, Id, S>,
    // TODO: Arrow equations, cell equations, composites
    //arr_equations: Vec<PathEq<ModalObType<Id>, ModeApp<Id>>>,
}

/// A modal double theory with identifiers of type `Ustr`.
pub type UstrModalDblTheory = ModalDblTheory<Ustr, BuildHasherDefault<IdentityHasher>>;

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

/// Graph of object types and *basic* morphism types in a modal double theory.
#[derive(RefCast)]
#[repr(transparent)]
struct ModalProedgeGraph<Id, S>(ModalDblTheory<Id, S>);

impl<Id, S> ModalProedgeGraph<Id, S>
where
    Id: Eq + Clone + Hash,
    S: BuildHasher,
{
    fn computad(&self) -> Computad<'_, ModalObType<Id>, ModalSet<Id, S>, Id, S> {
        Computad(ModalSet::ref_cast(&self.0.ob_generators), &self.0.pro_generators)
    }
}

impl<Id, S> Graph for ModalProedgeGraph<Id, S>
where
    Id: Eq + Clone + Hash,
    S: BuildHasher,
{
    type V = ModalObType<Id>;
    type E = ModeApp<Id>;

    fn has_vertex(&self, ob: &Self::V) -> bool {
        self.computad().has_vertex(ob)
    }
    fn has_edge(&self, proedge: &Self::E) -> bool {
        self.computad().has_edge(&proedge.arg)
    }
    fn src(&self, proedge: &Self::E) -> Self::V {
        proedge.as_ref().flat_map(|e| self.computad().src(e))
    }
    fn tgt(&self, proedge: &Self::E) -> Self::V {
        proedge.as_ref().flat_map(|e| self.computad().tgt(e))
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
        ModalProedgeGraph::ref_cast(&self.0).has_vertex(x)
    }
    fn has_edge(&self, path: &Self::E) -> bool {
        path.contained_in(ModalProedgeGraph::ref_cast(&self.0))
    }
    fn src(&self, path: &Self::E) -> Self::V {
        path.src(ModalProedgeGraph::ref_cast(&self.0))
    }
    fn tgt(&self, path: &Self::E) -> Self::V {
        path.tgt(ModalProedgeGraph::ref_cast(&self.0))
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

/// Graph of object types and *basic* object operations in a modal theory.
#[derive(RefCast)]
#[repr(transparent)]
struct ModalEdgeGraph<Id, S>(ModalDblTheory<Id, S>);

impl<Id, S> ModalEdgeGraph<Id, S>
where
    Id: Eq + Clone + Hash,
    S: BuildHasher,
{
    fn computad(&self) -> Computad<'_, ModalObType<Id>, ModalSet<Id, S>, Id, S> {
        Computad(ModalSet::ref_cast(&self.0.ob_generators), &self.0.arr_generators)
    }
}

impl<Id, S> Graph for ModalEdgeGraph<Id, S>
where
    Id: Eq + Clone + Hash,
    S: BuildHasher,
{
    type V = ModalObType<Id>;
    type E = ModeApp<ModalEdge<Id>>;

    fn has_vertex(&self, ob: &Self::V) -> bool {
        self.computad().has_vertex(ob)
    }
    fn has_edge(&self, edge: &Self::E) -> bool {
        match &edge.arg {
            ModalEdge::Generator(e) => self.computad().has_edge(e),
            ModalEdge::Mul(_, _, ob) => self.computad().has_vertex(ob),
        }
    }
    fn src(&self, edge: &Self::E) -> Self::V {
        edge.as_ref().flat_map(|arg| match arg {
            ModalEdge::Generator(e) => self.computad().src(e),
            ModalEdge::Mul(mode, n, ob) => ob.clone().apply_all(repeat_n(*mode, *n)),
        })
    }
    fn tgt(&self, edge: &Self::E) -> Self::V {
        edge.as_ref().flat_map(|arg| match arg {
            ModalEdge::Generator(e) => self.computad().tgt(e),
            ModalEdge::Mul(mode, _, ob) => ob.clone().apply(*mode),
        })
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
        ModalEdgeGraph::ref_cast(&self.0).has_vertex(x)
    }
    fn has_mor(&self, path: &Self::Mor) -> bool {
        path.contained_in(ModalEdgeGraph::ref_cast(&self.0))
    }
    fn dom(&self, path: &Self::Mor) -> Self::Ob {
        path.src(ModalEdgeGraph::ref_cast(&self.0))
    }
    fn cod(&self, path: &Self::Mor) -> Self::Ob {
        path.tgt(ModalEdgeGraph::ref_cast(&self.0))
    }
    fn compose(&self, path: Path<Self::Ob, Self::Mor>) -> Self::Mor {
        path.flatten()
    }
}

/// Virtual double graph of *basic* cells in a modal double theory.
#[derive(RefCast)]
#[repr(transparent)]
struct ModalVDblGraph<Id, S>(ModalDblTheory<Id, S>);

type ModalVDblComputad<'a, Id, S> = AVDCComputad<
    'a,
    ModalObType<Id>,
    ModalObOp<Id>,
    ModalMorType<Id>,
    ModalSet<Id, S>,
    UnderlyingGraph<ModalOneTheory<Id, S>>,
    ModalMorTypeGraph<Id, S>,
    Id,
    S,
>;

impl<Id, S> ModalVDblGraph<Id, S>
where
    Id: Eq + Clone + Hash,
    S: BuildHasher,
{
    fn computad(&self) -> ModalVDblComputad<'_, Id, S> {
        AVDCComputad {
            objects: ModalSet::ref_cast(&self.0.ob_generators),
            arrows: UnderlyingGraph::ref_cast(ModalOneTheory::ref_cast(&self.0)),
            proarrows: ModalMorTypeGraph::ref_cast(&self.0),
            computad: &self.0.cell_generators,
        }
    }
}

impl<Id, S> Validate for ModalVDblGraph<Id, S>
where
    Id: Eq + Clone + Hash,
    S: BuildHasher,
{
    type ValidationError = InvalidVDblGraph<Id, Id, Id>;

    fn validate(&self) -> Result<(), nonempty::NonEmpty<Self::ValidationError>> {
        let edge_graph = ModalEdgeGraph::ref_cast(&self.0);
        let edge_cptd = edge_graph.computad();
        let edge_errors = edge_cptd.iter_invalid().map(|err| match err {
            InvalidGraph::Src(e) => InvalidVDblGraph::Dom(e),
            InvalidGraph::Tgt(e) => InvalidVDblGraph::Cod(e),
        });
        let proedge_graph = ModalProedgeGraph::ref_cast(&self.0);
        let proedge_cptd = proedge_graph.computad();
        let proedge_errors = proedge_cptd.iter_invalid().map(|err| match err {
            InvalidGraph::Src(p) => InvalidVDblGraph::Src(p),
            InvalidGraph::Tgt(p) => InvalidVDblGraph::Tgt(p),
        });
        // Make sure one-dimensional data is valid before validating squares.
        validate::wrap_errors(edge_errors.chain(proedge_errors))?;

        validate::wrap_errors(self.computad().iter_invalid())
    }
}

impl<Id, S> VDblGraph for ModalVDblGraph<Id, S>
where
    Id: Eq + Clone + Hash,
    S: BuildHasher,
{
    type V = ModalObType<Id>;
    type E = ModalObOp<Id>;
    type ProE = ModalMorType<Id>;
    type Sq = ModeApp<ModalSquare<Id>>;

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
            ModalSquare::Generator(sq) => self.computad().has_square(sq),
            ModalSquare::Mul(_, _, p) => ModalProedgeGraph::ref_cast(&self.0).has_edge(p),
            // FIXME: Don't assume all composites exist.
            ModalSquare::Composite(_) => true,
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
            ModalSquare::Generator(sq) => self.computad().square_dom(sq),
            ModalSquare::Mul(mode, n, p) => {
                ShortPath::One(p.clone().apply_all(repeat_n(*mode, *n))).into()
            }
            ModalSquare::Composite(path) => path.clone(),
        };
        dom.map(|x| x.apply_all(sq.modes.clone()), |p| p.apply_all(sq.modes.clone()))
    }
    fn square_cod(&self, sq: &Self::Sq) -> Self::ProE {
        let cod = match &sq.arg {
            ModalSquare::Generator(sq) => self.computad().square_cod(sq),
            ModalSquare::Mul(mode, _, p) => p.clone().apply(*mode).into(),
            ModalSquare::Composite(_) => panic!("Composites not implemented"),
        };
        cod.apply_all(sq.modes.clone())
    }
    fn square_src(&self, sq: &Self::Sq) -> Self::E {
        let src = match &sq.arg {
            ModalSquare::Generator(sq) => self.computad().square_src(sq),
            ModalSquare::Mul(mode, n, p) => {
                let graph = ModalProedgeGraph::ref_cast(&self.0);
                ModeApp::new(ModalEdge::Mul(*mode, *n, graph.src(p))).into()
            }
            ModalSquare::Composite(path) => {
                Path::empty(path.src(ModalMorTypeGraph::ref_cast(&self.0)))
            }
        };
        src.apply_all(sq.modes.clone())
    }
    fn square_tgt(&self, sq: &Self::Sq) -> Self::E {
        let tgt = match &sq.arg {
            ModalSquare::Generator(sq) => self.computad().square_tgt(sq),
            ModalSquare::Mul(mode, n, p) => {
                let graph = ModalProedgeGraph::ref_cast(&self.0);
                ModeApp::new(ModalEdge::Mul(*mode, *n, graph.tgt(p))).into()
            }
            ModalSquare::Composite(path) => {
                Path::empty(path.tgt(ModalMorTypeGraph::ref_cast(&self.0)))
            }
        };
        tgt.apply_all(sq.modes.clone())
    }
    fn arity(&self, sq: &Self::Sq) -> usize {
        match &sq.arg {
            ModalSquare::Generator(sq) => self.computad().arity(sq),
            ModalSquare::Mul(_, _, _) => 1,
            ModalSquare::Composite(path) => path.len(),
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

// TODO: Validate the equations, not just the generating data.
impl<Id, S> Validate for ModalDblTheory<Id, S>
where
    Id: Eq + Clone + Hash,
    S: BuildHasher,
{
    type ValidationError = InvalidVDblGraph<Id, Id, Id>;

    fn validate(&self) -> Result<(), nonempty::NonEmpty<Self::ValidationError>> {
        ModalVDblGraph::ref_cast(self).validate()
    }
}

impl<Id, S> ModalDblTheory<Id, S>
where
    Id: Eq + Clone + Hash,
    S: BuildHasher,
{
    /// Adds a generating object type to the theory.
    pub fn add_ob_type(&mut self, id: Id) {
        self.ob_generators.insert(id);
    }

    /// Adds a generating morphism type to the theory.
    pub fn add_mor_type(&mut self, id: Id, src: ModalObType<Id>, tgt: ModalObType<Id>) {
        self.pro_generators.add_edge(id, src, tgt);
    }

    /// Adds a generating object operation to the theory.
    pub fn add_ob_op(&mut self, id: Id, dom: ModalObType<Id>, cod: ModalObType<Id>) {
        self.arr_generators.add_edge(id, dom, cod);
    }

    /// Adds a generating morphism operation to the theory.
    pub fn add_mor_op(
        &mut self,
        id: Id,
        dom: Path<ModalObType<Id>, ModalMorType<Id>>,
        cod: ModalMorType<Id>,
        src: ModalObOp<Id>,
        tgt: ModalObOp<Id>,
    ) {
        self.cell_generators.add_square(id, dom, cod.into(), src, tgt);
    }

    /// Adds a morphism operation with nullary domain and unit codomain.
    pub fn add_special_mor_op(&mut self, id: Id, src: ModalObOp<Id>, tgt: ModalObOp<Id>) {
        let dom = self.dom(&src); // == self.dom(&tgt)
        let cod = self.cod(&src); // == self.cod(&tgt)
        self.add_mor_op(id, Path::empty(dom), ShortPath::Zero(cod), src, tgt);
    }
}
