/*! Modal double theories.

A **modal double theory** is a unital VDC equipped a family of modalities. A
**modality** is minimally an endomorphism, and is usually a monad or comonad, in
the 2-category of unital VDCs, normal functors, and natural transformations. In
a model of a modal double theory, each endomorphism on the theory is interpreted
as a endofunctor on the VDC of sets, i.e., as a lax double endofunctor on the
double category of sets. The modalities on the semantics side are fixed across
all models and include the double list monads and its many variants.

The various modalities are implicitly organized by a **mode theory** ([Licata &
Shulman 2015](crate::refs::AdjointLogic)), a 2-category whose objects are called
**modes**, morphisms are called **modalities**, and cells are sometimes called
**laws**. Our mode theory has only one mode, corresponding to the fact our
semantics is currently fixed to be the double category of sets and spans. Thus,
our mode theory is actually a monoidal category. It seems excessively meta at
this stage to reify the mode theory as the data of a finitely presented
2-category or monoidal category. Instead, the mode theory is implicit and baked
in at the type level.
*/

use std::iter::repeat_n;

use derivative::Derivative;
use derive_more::From;
use ref_cast::RefCast;

use crate::dbl::computad::{AVDCComputad, AVDCComputadTop};
use crate::dbl::theory::InvalidDblTheory;
use crate::dbl::{DblTree, InvalidVDblGraph, VDCWithComposites, VDblCategory, VDblGraph};
use crate::one::computad::{Computad, ComputadTop};
use crate::validate::{self, Validate};
use crate::{one::*, zero::*};

/// Modalities available in a modal double theory.
#[derive(Clone, Copy, Debug, PartialEq, Eq, From)]
pub enum Modality {
    /// List modalities, all of which are monads.
    #[from]
    List(List),

    /// Discrete modality, an idempotent comonad.
    Discrete(),

    /// Codiscrete modality, an idempotent monad.
    Codiscrete(),
}

/** List modalities available in a modal double theory.

There is just one list, or free monoid, monad on the category of sets, but the
double category of sets admits, besides the [plain](Self::Plain) list double
monad, a number of variations decorating the spans of lists with extra
combinatorial data.
 */
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum List {
    /// Lists of objects and morphisms (of same length).
    Plain,

    /// Lists of objects and morphisms, allowing permutation of the codomain list.
    Symmetric,

    /** Lists of objects and morphisms, allowing reindexing of the codomain list.

    This modality is a skeletized version of the "finite family", or free finite
    [coproduct completion](https://ncatlab.org/nlab/show/free+coproduct+completion),
    construction.
     */
    Coproduct,

    /** Lists of objects and morphisms, allowing reindexing of the domain list.

    This modality is a skeletized version of the free finite product completion.
     */
    Product,

    /** Lists of objects and morphisms, allowing independent reindexing of both
    domain and codomain lists.

    This modality is a version of the free finite biproduct completion,
    equivalent to freely enriching in commutative monoids and then applying the
    matrix construction (Mac Lane, Exercise VIII.2.6) on such an enriched
    category.
    */
    Biproduct,
}

/** Application of modalities.

Due to the simplicity of this logic, we can easily put terms in normal form:
every term is a single argument along with a (possibly empty) list of modalities
applied to it.
 */
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ModeApp<T> {
    /// Argument to which the modalities are applied.
    pub arg: T,

    /// List of modalities applied (from left to right).
    pub modalities: Vec<Modality>,
}

impl<T> ModeApp<T> {
    /// Constructs a new term with no modalities applied.
    pub fn new(arg: T) -> Self {
        Self {
            arg,
            modalities: Default::default(),
        }
    }

    /** Converts from `&ModeApp<T>` to `ModeApp<&T>`.

    Note that this requires cloning the list of applied modalities.
    */
    pub fn as_ref(&self) -> ModeApp<&T> {
        ModeApp {
            arg: &self.arg,
            modalities: self.modalities.clone(),
        }
    }

    /// Applies a modality.
    pub fn apply(mut self, m: Modality) -> Self {
        self.modalities.push(m);
        self
    }

    /// Applies a sequence of modalities.
    pub fn apply_all(mut self, iter: impl IntoIterator<Item = Modality>) -> Self {
        self.modalities.extend(iter);
        self
    }

    /// Maps over the argument.
    pub fn map<S, F: FnOnce(T) -> S>(self, f: F) -> ModeApp<S> {
        let ModeApp { arg, modalities } = self;
        ModeApp {
            arg: f(arg),
            modalities,
        }
    }

    /// Maps over the argument, flattening nested applications.
    pub fn flat_map<S, F: FnOnce(T) -> ModeApp<S>>(self, f: F) -> ModeApp<S> {
        let ModeApp { arg, modalities } = self;
        f(arg).apply_all(modalities)
    }
}

/** A basic operation in a modal double theory.

These are (object or morphisms) operations that cannot be built out of others
using the structure of a VDC or virtual equipment.
 */
#[derive(Clone, Debug, PartialEq, Eq, From)]
pub enum ModalOp {
    /// Generating operation.
    #[from]
    Generator(QualifiedName),

    /** List concentation.

    This is a component of the monad multiplication for a [list](List) modality.
    It is given in unbiased style, where the second argument is the arity.
     */
    Concat(List, usize, ModeApp<QualifiedName>),
}

/// An object type in a modal double theory.
pub type ModalObType = ModeApp<QualifiedName>;

/// A morphism type in a modal double theory.
pub type ModalMorType = ShortPath<ModalObType, ModeApp<QualifiedName>>;

impl ModalMorType {
    /// Applies a modality.
    pub fn apply(self, m: Modality) -> Self {
        self.map(|x| x.apply(m), |f| f.apply(m))
    }

    /// Applies a sequence of modalities.
    pub fn apply_all(self, iter: impl IntoIterator<Item = Modality>) -> Self {
        match self {
            ShortPath::Zero(x) => ShortPath::Zero(x.apply_all(iter)),
            ShortPath::One(f) => ShortPath::One(f.apply_all(iter)),
        }
    }
}

/// An object operation in a modal double theory.
pub type ModalObOp = Path<ModalObType, ModeApp<ModalOp>>;

impl ModalObOp {
    /// Constructs the object operation for a generator.
    pub fn generator(id: QualifiedName) -> Self {
        ModeApp::new(ModalOp::Generator(id)).into()
    }

    /// Constructs a concatenation operation for a list modality.
    pub fn concat(list: List, arity: usize, ob_type: ModalObType) -> Self {
        ModeApp::new(ModalOp::Concat(list, arity, ob_type)).into()
    }

    /// Applies a modality.
    pub fn apply(self, m: Modality) -> Self {
        self.map(|x| x.apply(m), |f| f.apply(m))
    }

    /// Applies a sequence of modalities.
    pub fn apply_all(self, iter: impl IntoIterator<Item = Modality> + Clone) -> Self {
        match self {
            Path::Id(x) => Path::Id(x.apply_all(iter)),
            Path::Seq(edges) => Path::Seq(edges.map(|p| p.apply_all(iter.clone()))),
        }
    }
}

/** A node in a morphism operation of a modal double theory.

A generic [morphism operation](ModalMorOp) in a modal double theory is a [double
tree](DblTree) built out of these nodes.
 */
#[derive(Clone, Debug, PartialEq, Eq, From)]
pub enum ModalNode {
    /// Basic morphism operation.
    #[from]
    Basic(ModeApp<ModalOp>),

    /// Unit cell on a basic object operation.
    Unit(ModeApp<ModalOp>),

    /** Cell witnessing a composite.

    By assumption, modalities preserve all composites in the theory.
     */
    Composite(Path<ModalObType, ModalMorType>),
}

/// A morphism operation in a modal double theory.
pub type ModalMorOp = DblTree<ModalObOp, ModalMorType, ModalNode>;

/// A modal double theory.
#[derive(Debug, Derivative)]
#[derivative(Default(new = "true"))]
pub struct ModalDblTheory {
    ob_generators: HashFinSet<QualifiedName>,
    arr_generators: ComputadTop<ModalObType, QualifiedName>,
    pro_generators: ComputadTop<ModalObType, QualifiedName>,
    cell_generators: AVDCComputadTop<ModalObType, ModalObOp, ModalMorType, QualifiedName>,
    arr_equations: Vec<PathEq<ModalObType, ModeApp<ModalOp>>>,
    // TODO: Cell equations and composites
}

/// Set of object types in a modal double theory.
#[derive(RefCast)]
#[repr(transparent)]
pub(super) struct ModalObTypes(ModalDblTheory);

impl Set for ModalObTypes {
    type Elem = ModeApp<QualifiedName>;

    fn contains(&self, ob: &Self::Elem) -> bool {
        self.0.ob_generators.contains(&ob.arg)
    }
}

/// Graph of object types and *basic* morphism types in a modal double theory.
#[derive(RefCast)]
#[repr(transparent)]
struct ModalProedgeGraph(ModalDblTheory);

impl Graph for ModalProedgeGraph {
    type V = ModalObType;
    type E = ModeApp<QualifiedName>;

    fn has_vertex(&self, ob: &Self::V) -> bool {
        self.0.loose_computad().has_vertex(ob)
    }
    fn has_edge(&self, proedge: &Self::E) -> bool {
        self.0.loose_computad().has_edge(&proedge.arg)
    }
    fn src(&self, proedge: &Self::E) -> Self::V {
        proedge.as_ref().flat_map(|e| self.0.loose_computad().src(e))
    }
    fn tgt(&self, proedge: &Self::E) -> Self::V {
        proedge.as_ref().flat_map(|e| self.0.loose_computad().tgt(e))
    }
}

/// Graph of object/morphism types in a modal double theory.
#[derive(RefCast)]
#[repr(transparent)]
pub(super) struct ModalMorTypeGraph(ModalDblTheory);

impl Graph for ModalMorTypeGraph {
    type V = ModalObType;
    type E = ModalMorType;

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

impl ReflexiveGraph for ModalMorTypeGraph {
    fn refl(&self, x: Self::V) -> Self::E {
        ShortPath::Zero(x)
    }
}

/// Graph of object types and *basic* object operations in a modal theory.
#[derive(RefCast)]
#[repr(transparent)]
struct ModalEdgeGraph(ModalDblTheory);

impl Graph for ModalEdgeGraph {
    type V = ModalObType;
    type E = ModeApp<ModalOp>;

    fn has_vertex(&self, ob: &Self::V) -> bool {
        self.0.tight_computad().has_vertex(ob)
    }
    fn has_edge(&self, edge: &Self::E) -> bool {
        match &edge.arg {
            ModalOp::Generator(e) => self.0.tight_computad().has_edge(e),
            ModalOp::Concat(_, _, ob) => self.0.tight_computad().has_vertex(ob),
        }
    }
    fn src(&self, edge: &Self::E) -> Self::V {
        edge.as_ref().flat_map(|arg| match arg {
            ModalOp::Generator(e) => self.0.tight_computad().src(e),
            ModalOp::Concat(list, n, ob) => {
                ob.clone().apply_all(repeat_n(Modality::List(*list), *n))
            }
        })
    }
    fn tgt(&self, edge: &Self::E) -> Self::V {
        edge.as_ref().flat_map(|arg| match arg {
            ModalOp::Generator(e) => self.0.tight_computad().tgt(e),
            ModalOp::Concat(list, _, ob) => ob.clone().apply(Modality::List(*list)),
        })
    }
}

/// Category of object types/operations in a modal double theory.
#[derive(RefCast)]
#[repr(transparent)]
pub(super) struct ModalOneTheory(ModalDblTheory);

impl Category for ModalOneTheory {
    type Ob = ModalObType;
    type Mor = ModalObOp;

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
struct ModalVDblGraph(ModalDblTheory);

type ModalVDblComputad<'a> = AVDCComputad<
    'a,
    ModalObType,
    ModalObOp,
    ModalMorType,
    ModalObTypes,
    UnderlyingGraph<ModalOneTheory>,
    ModalMorTypeGraph,
    QualifiedName,
>;

impl Validate for ModalVDblGraph {
    type ValidationError = InvalidVDblGraph<QualifiedName, QualifiedName, QualifiedName>;

    fn validate(&self) -> Result<(), nonempty::NonEmpty<Self::ValidationError>> {
        let edge_cptd = self.0.tight_computad();
        let edge_errors = edge_cptd.iter_invalid().map(|err| match err {
            InvalidGraph::Src(e) => InvalidVDblGraph::Dom(e),
            InvalidGraph::Tgt(e) => InvalidVDblGraph::Cod(e),
        });
        let proedge_cptd = self.0.loose_computad();
        let proedge_errors = proedge_cptd.iter_invalid().map(|err| match err {
            InvalidGraph::Src(p) => InvalidVDblGraph::Src(p),
            InvalidGraph::Tgt(p) => InvalidVDblGraph::Tgt(p),
        });
        // Make sure one-dimensional data is valid before validating squares.
        validate::wrap_errors(edge_errors.chain(proedge_errors))?;

        validate::wrap_errors(self.0.dbl_computad().iter_invalid())
    }
}

impl VDblGraph for ModalVDblGraph {
    type V = ModalObType;
    type E = ModalObOp;
    type ProE = ModalMorType;
    type Sq = ModalNode;

    fn has_vertex(&self, x: &Self::V) -> bool {
        ModalObTypes::ref_cast(&self.0).contains(x)
    }
    fn has_edge(&self, path: &Self::E) -> bool {
        ModalOneTheory::ref_cast(&self.0).has_mor(path)
    }
    fn has_proedge(&self, path: &Self::ProE) -> bool {
        ModalMorTypeGraph::ref_cast(&self.0).has_edge(path)
    }
    fn has_square(&self, node: &Self::Sq) -> bool {
        match node {
            ModalNode::Basic(app) => match &app.arg {
                ModalOp::Generator(sq) => self.0.dbl_computad().has_square(sq),
                ModalOp::Concat(_, _, p) => ModalProedgeGraph::ref_cast(&self.0).has_edge(p),
            },
            ModalNode::Unit(f) => ModalEdgeGraph::ref_cast(&self.0).has_edge(f),
            // FIXME: Don't assume all composites exist.
            ModalNode::Composite(_) => true,
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

    fn square_dom(&self, node: &Self::Sq) -> Path<Self::V, Self::ProE> {
        match node {
            ModalNode::Basic(app) => {
                let ModeApp { arg, modalities } = app;
                let dom = match &arg {
                    ModalOp::Generator(sq) => self.0.dbl_computad().square_dom(sq),
                    ModalOp::Concat(list, n, p) => {
                        let ob_type = p.clone().apply_all(repeat_n(Modality::List(*list), *n));
                        ShortPath::One(ob_type).into()
                    }
                };
                dom.map(|x| x.apply_all(modalities.clone()), |p| p.apply_all(modalities.clone()))
            }
            ModalNode::Unit(f) => {
                ModalMorType::Zero(ModalEdgeGraph::ref_cast(&self.0).src(f)).into()
            }
            ModalNode::Composite(path) => path.clone(),
        }
    }
    fn square_cod(&self, node: &Self::Sq) -> Self::ProE {
        match node {
            ModalNode::Basic(app) => {
                let cod = match &app.arg {
                    ModalOp::Generator(sq) => self.0.dbl_computad().square_cod(sq),
                    ModalOp::Concat(list, _, p) => p.clone().apply(Modality::List(*list)).into(),
                };
                cod.apply_all(app.modalities.clone())
            }
            ModalNode::Unit(f) => ModalMorType::Zero(ModalEdgeGraph::ref_cast(&self.0).tgt(f)),
            ModalNode::Composite(path) => {
                self.0.composite(path.clone()).expect("Composite should exist")
            }
        }
    }
    fn square_src(&self, node: &Self::Sq) -> Self::E {
        match node {
            ModalNode::Basic(app) => {
                let src = match &app.arg {
                    ModalOp::Generator(sq) => self.0.dbl_computad().square_src(sq),
                    ModalOp::Concat(list, n, p) => {
                        let graph = ModalProedgeGraph::ref_cast(&self.0);
                        ModeApp::new(ModalOp::Concat(*list, *n, graph.src(p))).into()
                    }
                };
                src.apply_all(app.modalities.clone())
            }
            ModalNode::Unit(f) => f.clone().into(),
            ModalNode::Composite(path) => {
                Path::empty(path.src(ModalMorTypeGraph::ref_cast(&self.0)))
            }
        }
    }
    fn square_tgt(&self, node: &Self::Sq) -> Self::E {
        match node {
            ModalNode::Basic(app) => {
                let tgt = match &app.arg {
                    ModalOp::Generator(sq) => self.0.dbl_computad().square_tgt(sq),
                    ModalOp::Concat(list, n, p) => {
                        let graph = ModalProedgeGraph::ref_cast(&self.0);
                        ModeApp::new(ModalOp::Concat(*list, *n, graph.tgt(p))).into()
                    }
                };
                tgt.apply_all(app.modalities.clone())
            }
            ModalNode::Unit(f) => f.clone().into(),
            ModalNode::Composite(path) => {
                Path::empty(path.tgt(ModalMorTypeGraph::ref_cast(&self.0)))
            }
        }
    }
    fn arity(&self, node: &Self::Sq) -> usize {
        match node {
            ModalNode::Basic(app) => match &app.arg {
                ModalOp::Generator(sq) => self.0.dbl_computad().arity(sq),
                ModalOp::Concat(_, _, _) => 1,
            },
            ModalNode::Unit(_) => 1,
            ModalNode::Composite(path) => path.len(),
        }
    }
}

impl VDblCategory for ModalDblTheory {
    type Ob = ModalObType;
    type Arr = ModalObOp;
    type Pro = ModalMorType;
    type Cell = ModalMorOp;

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

impl VDCWithComposites for ModalDblTheory {
    fn composite_ext(&self, path: Path<Self::Ob, Self::Pro>) -> Option<Self::Cell> {
        if self.composite(path.clone()).is_some() {
            let graph = ModalVDblGraph::ref_cast(self);
            Some(DblTree::single(ModalNode::Composite(path), graph))
        } else {
            None
        }
    }

    fn composite(&self, path: Path<Self::Ob, Self::Pro>) -> Option<Self::Pro> {
        match path {
            Path::Id(x) => Some(ShortPath::Zero(x)),
            Path::Seq(ms) => {
                if ms.len() == 1 {
                    Some(ms.head)
                } else {
                    // TODO: Support nontrivial composites.
                    None
                }
            }
        }
    }

    fn through_composite(
        &self,
        _cell: Self::Cell,
        _range: std::ops::Range<usize>,
    ) -> Option<Self::Cell> {
        panic!("Universal property of composites is not implemented")
    }
}

impl Validate for ModalDblTheory {
    type ValidationError = InvalidDblTheory;

    fn validate(&self) -> Result<(), nonempty::NonEmpty<Self::ValidationError>> {
        // Validate generating data.
        ModalVDblGraph::ref_cast(self)
            .validate()
            .map_err(|errs| errs.map(|err| err.into()))?;

        // Validate equations between object operations.
        let graph = ModalEdgeGraph::ref_cast(self);
        let arr_errors = self.arr_equations.iter().enumerate().filter_map(|(id, eq)| {
            let errs = eq.validate_in(graph).err()?;
            Some(InvalidDblTheory::ObOpEq(id, errs))
        });
        validate::wrap_errors(arr_errors)
    }
}

impl ModalDblTheory {
    /// Gets the computad generating the proarrows of the theory.
    pub(super) fn loose_computad(&self) -> Computad<'_, ModalObType, ModalObTypes, QualifiedName> {
        Computad::new(ModalObTypes::ref_cast(self), &self.pro_generators)
    }

    /// Gets the computad generating the arrows of the theory.
    pub(super) fn tight_computad(&self) -> Computad<'_, ModalObType, ModalObTypes, QualifiedName> {
        Computad::new(ModalObTypes::ref_cast(self), &self.arr_generators)
    }

    /// Gets the double computad generating the theory.
    pub(super) fn dbl_computad(&self) -> ModalVDblComputad<'_> {
        AVDCComputad::new(
            ModalObTypes::ref_cast(self),
            UnderlyingGraph::ref_cast(ModalOneTheory::ref_cast(self)),
            ModalMorTypeGraph::ref_cast(self),
            &self.cell_generators,
        )
    }

    /// Adds a generating object type to the theory.
    pub fn add_ob_type(&mut self, id: QualifiedName) {
        self.ob_generators.insert(id);
    }

    /// Adds a generating morphism type to the theory.
    pub fn add_mor_type(&mut self, id: QualifiedName, src: ModalObType, tgt: ModalObType) {
        self.pro_generators.add_edge(id, src, tgt);
    }

    /// Adds a generating object operation to the theory.
    pub fn add_ob_op(&mut self, id: QualifiedName, dom: ModalObType, cod: ModalObType) {
        self.arr_generators.add_edge(id, dom, cod);
    }

    /// Adds a generating morphism operation to the theory.
    pub fn add_mor_op(
        &mut self,
        id: QualifiedName,
        dom: Path<ModalObType, ModalMorType>,
        cod: ModalMorType,
        src: ModalObOp,
        tgt: ModalObOp,
    ) {
        self.cell_generators.add_square(id, dom, cod.into(), src, tgt);
    }

    /// Adds a morphism operation with nullary domain and unit codomain.
    pub fn add_special_mor_op(&mut self, id: QualifiedName, src: ModalObOp, tgt: ModalObOp) {
        let dom = self.dom(&src); // == self.dom(&tgt)
        let cod = self.cod(&src); // == self.cod(&tgt)
        self.add_mor_op(id, Path::empty(dom), ShortPath::Zero(cod), src, tgt);
    }

    /// Equate two object operations in the theory.
    pub fn equate_ob_ops(&mut self, lhs: ModalObOp, rhs: ModalObOp) {
        self.arr_equations.push(PathEq::new(lhs, rhs))
    }
}
