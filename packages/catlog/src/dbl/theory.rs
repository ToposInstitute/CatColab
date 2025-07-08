/*! Double theories.

A double theory specifies a categorical structure, meaning a category (or
categories) equipped with extra structure. The spirit of the formalism is that a
double theory is "just" a [virtual double category](super::category),
categorifying Lawvere's idea that a theory is "just" a category. Thus, a double
theory is a [concept with an
attitude](https://ncatlab.org/nlab/show/concept+with+an+attitude). To bring out
these intuitions, the interface for double theories, [`DblTheory`], introduces
new terminology compared to the references cited below.

# Terminology

A double theory comprises four kinds of things:

1. **Object type**, interpreted in models as a set of objects.

2. **Morphism type**, having a source and a target object type and interpreted
   in models as a span of morphisms (or
   [heteromorphisms](https://ncatlab.org/nlab/show/heteromorphism)) between sets
   of objects.

3. **Object operation**, interpreted in models as a function between sets of
   objects.

4. **Morphism operation**, having a source and target object operation and
   interpreted in models as map between spans of morphisms.

The dictionary between the type-theoretic and double-categorical terminology is
summarized by the table:

| Associated type                 | Double theory      | Double category           | Interpreted as |
|---------------------------------|--------------------|---------------------------|----------------|
| [`ObType`](DblTheory::ObType)   | Object type        | Object                    | Set            |
| [`MorType`](DblTheory::MorType) | Morphism type      | Proarrow (loose morphism) | Span           |
| [`ObOp`](DblTheory::ObOp)       | Object operation   | Arrow (tight morphism)    | Function       |
| [`MorOp`](DblTheory::MorOp)     | Morphism operation | Cell                      | Map of spans   |

Models of a double theory are *categorical* structures, rather than merely
*set-theoretical* ones, because each object type is assigned not just a set of
objects but also a span of morphisms between those objects, constituting a
category. The morphisms come from a distinguished "Hom" morphism type for each
object type in the double theory. Similarly, each object operation is not just a
function but a functor because it comes with an "Hom" operation between the Hom
types. Moreover, morphism types can be composed to give new ones, as summarized
by the table:

| Method                                      | Double theory          | Double category        |
|---------------------------------------------|------------------------|------------------------|
| [`hom_type`](DblTheory::hom_type)           | Hom type               | Identity proarrow      |
| [`hom_op`](DblTheory::hom_op)               | Hom operation          | Identity cell on arrow |
| [`compose_types`](DblTheory::compose_types) | Compose morphism types | Compose proarrows      |

Finally, operations on both objects and morphisms have identities and can be
composed:

| Method                                          | Double theory                       | Double category           |
|-------------------------------------------------|-------------------------------------|---------------------------|
| [`id_ob_op`](DblTheory::id_ob_op)               | Identity operation on object type   | Identity arrow            |
| [`id_mor_op`](DblTheory::id_mor_op)             | Identity operation on morphism type | Identity cell on proarrow |
| [`compose_ob_ops`](DblTheory::compose_ob_ops)   | Compose object operations           | Compose arrows            |
| [`compose_mor_ops`](DblTheory::compose_mor_ops) | Compose morphism operations         | Compose cells             |

# References

- [Lambert & Patterson, 2024](crate::refs::CartDblTheories)
- [Patterson, 2024](crate::refs::DblProducts),
  Section 10: Finite-product double theories
*/

use std::hash::{BuildHasher, BuildHasherDefault, Hash, RandomState};
use std::ops::Range;

use derivative::Derivative;
use derive_more::From;
use ref_cast::RefCast;
use ustr::{IdentityHasher, Ustr};

use super::category::*;
use super::graph::ProedgeGraph;
use super::tree::{DblNode, DblTree};
use crate::one::{Graph, path::Path, tree::OpenTree};
use crate::one::{category::*, fp_category::UstrFpCategory};
use crate::validate::Validate;
use crate::zero::*;

/** A double theory.

A double theory is "just" a virtual double category (VDC) assumed to have units.
Reflecting this, this trait has a blanket implementation for any
[`VDblCategory`]. It is not recommended to implement this trait directly.

See the [module-level docs](super::theory) for background on the terminology.
 */
pub trait DblTheory {
    /** Rust type of object types in the theory.

    Viewing the double theory as a virtual double category, this is the type of
    objects.
    */
    type ObType: Eq + Clone;

    /** Rust type of morphism types in the theory.

    Viewing the double theory as a virtual double category, this is the type of
    proarrows.
    */
    type MorType: Eq + Clone;

    /** Rust type of operations on objects in the double theory.

    Viewing the double theory as a virtual double category, this is the type of
    arrows.
    */
    type ObOp: Eq + Clone;

    /** Rust type of operations on morphisms in the double theory.

    Viewing the double theory as a virtual double category, this is the type of
    cells.
    */
    type MorOp: Eq + Clone;

    /// Does the object type belong to the theory?
    fn has_ob_type(&self, x: &Self::ObType) -> bool;

    /// Does the morphism type belong to the theory?
    fn has_mor_type(&self, m: &Self::MorType) -> bool;

    /// Does the object operation belong to the theory?
    fn has_ob_op(&self, f: &Self::ObOp) -> bool;

    /// Does the morphism operation belong to the theory?
    fn has_mor_op(&self, α: &Self::MorOp) -> bool;

    /// Source of a morphism type.
    fn src_type(&self, m: &Self::MorType) -> Self::ObType;

    /// Target of a morphism type.
    fn tgt_type(&self, m: &Self::MorType) -> Self::ObType;

    /// Domain of an operation on objects.
    fn ob_op_dom(&self, f: &Self::ObOp) -> Self::ObType;

    /// Codomain of an operation on objects.
    fn ob_op_cod(&self, f: &Self::ObOp) -> Self::ObType;

    /// Source operation of an operation on morphisms.
    fn src_op(&self, α: &Self::MorOp) -> Self::ObOp;

    /// Target operation of an operation on morphisms.
    fn tgt_op(&self, α: &Self::MorOp) -> Self::ObOp;

    /// Domain of an operation on morphisms, a path of morphism types.
    fn mor_op_dom(&self, α: &Self::MorOp) -> Path<Self::ObType, Self::MorType>;

    /// Codomain of an operation on morphisms, a single morphism type.
    fn mor_op_cod(&self, α: &Self::MorOp) -> Self::MorType;

    /// Composes a sequence of morphism types, if they have a composite.
    fn compose_types(&self, path: Path<Self::ObType, Self::MorType>) -> Option<Self::MorType>;

    /** Hom morphism type on an object type.

    Viewing the double theory as a virtual double category, this is the unit
    proarrow on an object.
    */
    fn hom_type(&self, x: Self::ObType) -> Self::MorType {
        self.compose_types(Path::Id(x))
            .expect("A double theory should have a hom type for each object type")
    }

    /// Compose a sequence of operations on objects.
    fn compose_ob_ops(&self, path: Path<Self::ObType, Self::ObOp>) -> Self::ObOp;

    /** Identity operation on an object type.

    View the double theory as a virtual double category, this is the identity
    arrow on an object.
    */
    fn id_ob_op(&self, x: Self::ObType) -> Self::ObOp {
        self.compose_ob_ops(Path::Id(x))
    }

    /** Hom morphism operation on an object operation.

    Viewing the double theory as a virtual double category, this is the unit
    cell on an arrow.
     */
    fn hom_op(&self, f: Self::ObOp) -> Self::MorOp;

    /// Compose operations on morphisms.
    fn compose_mor_ops(&self, tree: DblTree<Self::ObOp, Self::MorType, Self::MorOp>)
    -> Self::MorOp;

    /** Identity operation on a morphism type.

    Viewing the double theory as a virtual double category, this is the identity
    cell on a proarrow.
    */
    fn id_mor_op(&self, m: Self::MorType) -> Self::MorOp {
        self.compose_mor_ops(DblTree::empty(m))
    }
}

impl<VDC: VDCWithComposites> DblTheory for VDC {
    type ObType = VDC::Ob;
    type MorType = VDC::Pro;
    type ObOp = VDC::Arr;
    type MorOp = VDC::Cell;

    fn has_ob_type(&self, x: &Self::ObType) -> bool {
        self.has_ob(x)
    }
    fn has_mor_type(&self, m: &Self::MorType) -> bool {
        self.has_proarrow(m)
    }
    fn has_ob_op(&self, f: &Self::ObOp) -> bool {
        self.has_arrow(f)
    }
    fn has_mor_op(&self, α: &Self::MorOp) -> bool {
        self.has_cell(α)
    }

    fn src_type(&self, m: &Self::MorType) -> Self::ObType {
        self.src(m)
    }
    fn tgt_type(&self, m: &Self::MorType) -> Self::ObType {
        self.tgt(m)
    }
    fn ob_op_dom(&self, f: &Self::ObOp) -> Self::ObType {
        self.dom(f)
    }
    fn ob_op_cod(&self, f: &Self::ObOp) -> Self::ObType {
        self.cod(f)
    }

    fn src_op(&self, α: &Self::MorOp) -> Self::ObOp {
        self.cell_src(α)
    }
    fn tgt_op(&self, α: &Self::MorOp) -> Self::ObOp {
        self.cell_tgt(α)
    }
    fn mor_op_dom(&self, α: &Self::MorOp) -> Path<Self::ObType, Self::MorType> {
        self.cell_dom(α)
    }
    fn mor_op_cod(&self, α: &Self::MorOp) -> Self::MorType {
        self.cell_cod(α)
    }

    fn compose_types(&self, path: Path<Self::ObType, Self::MorType>) -> Option<Self::MorType> {
        self.composite(path)
    }
    fn hom_type(&self, x: Self::ObType) -> Self::MorType {
        self.unit(x).expect("A double theory should have all hom types")
    }
    fn hom_op(&self, f: Self::ObOp) -> Self::MorOp {
        let y = self.cod(&f);
        let y_ext = self.unit_ext(y).expect("Codomain of arrow should have hom type");
        let cell = self.compose_cells(DblTree(
            OpenTree::linear(vec![DblNode::Spine(f), DblNode::Cell(y_ext)]).unwrap(),
        ));
        self.through_unit(cell, 0).expect("Domain of arrow should have hom type")
    }

    fn compose_ob_ops(&self, path: Path<Self::ObType, Self::ObOp>) -> Self::ObOp {
        self.compose(path)
    }
    fn id_ob_op(&self, x: Self::ObType) -> Self::ObOp {
        self.id(x)
    }

    fn compose_mor_ops(
        &self,
        tree: DblTree<Self::ObOp, Self::MorType, Self::MorOp>,
    ) -> Self::MorOp {
        self.compose_cells(tree)
    }
    fn id_mor_op(&self, m: Self::MorType) -> Self::MorOp {
        self.id_cell(m)
    }
}

/** A discrete double theory.

A **discrete double theory** is a double theory with no nontrivial operations on
either object or morphism types. Viewed as a double category, such a theory is
indeed **discrete**, which can equivalently be defined as

- a discrete object in the 2-category of double categories
- a double category whose underlying categories are both discrete categories
*/
#[derive(From, RefCast, Debug)]
#[repr(transparent)]
pub struct DiscreteDblTheory<Cat: FgCategory>(Cat);

/// A discrete double theory with keys of type `Ustr`.
pub type UstrDiscreteDblTheory = DiscreteDblTheory<UstrFpCategory>;

impl<Cat: FgCategory> DiscreteDblTheory<Cat> {
    /// Gets a reference to the underlying category of object/morphism types.
    pub fn category(&self) -> &Cat {
        &self.0
    }
}

impl<C: FgCategory> VDblCategory for DiscreteDblTheory<C>
where
    C::Ob: Clone,
    C::Mor: Clone,
{
    type Ob = C::Ob;
    type Arr = C::Ob;
    type Pro = C::Mor;
    type Cell = Path<C::Ob, C::Mor>;

    fn has_ob(&self, ob: &Self::Ob) -> bool {
        self.0.has_ob(ob)
    }
    fn has_arrow(&self, arr: &Self::Arr) -> bool {
        self.0.has_ob(arr)
    }
    fn has_proarrow(&self, pro: &Self::Pro) -> bool {
        self.0.has_mor(pro)
    }
    fn has_cell(&self, path: &Self::Cell) -> bool {
        path.contained_in(UnderlyingGraph::ref_cast(&self.0))
    }

    fn dom(&self, f: &Self::Arr) -> Self::Ob {
        f.clone()
    }
    fn cod(&self, f: &Self::Arr) -> Self::Ob {
        f.clone()
    }
    fn src(&self, m: &Self::Pro) -> Self::Ob {
        self.0.dom(m)
    }
    fn tgt(&self, m: &Self::Pro) -> Self::Ob {
        self.0.cod(m)
    }

    fn cell_dom(&self, path: &Self::Cell) -> Path<Self::Ob, Self::Pro> {
        path.clone()
    }
    fn cell_cod(&self, path: &Self::Cell) -> Self::Pro {
        self.composite(path.clone()).expect("Path should have a composite")
    }
    fn cell_src(&self, path: &Self::Cell) -> Self::Arr {
        path.src(UnderlyingGraph::ref_cast(&self.0))
    }
    fn cell_tgt(&self, path: &Self::Cell) -> Self::Arr {
        path.tgt(UnderlyingGraph::ref_cast(&self.0))
    }

    fn compose(&self, path: Path<Self::Ob, Self::Arr>) -> Self::Arr {
        let disc = DiscreteCategory::ref_cast(ObSet::ref_cast(&self.0));
        disc.compose(path)
    }

    fn compose_cells(&self, tree: DblTree<Self::Arr, Self::Pro, Self::Cell>) -> Self::Cell {
        tree.dom(UnderlyingDblGraph::ref_cast(self))
    }
}

impl<C: FgCategory> VDCWithComposites for DiscreteDblTheory<C>
where
    C::Ob: Clone,
    C::Mor: Clone,
{
    fn composite(&self, path: Path<Self::Ob, Self::Pro>) -> Option<Self::Pro> {
        Some(self.0.compose(path))
    }

    /// In a discrete double theory, every cell is an extension.
    fn composite_ext(&self, path: Path<Self::Ob, Self::Pro>) -> Option<Self::Cell> {
        Some(path)
    }

    fn through_composite(&self, path: Self::Cell, range: Range<usize>) -> Option<Self::Cell> {
        let graph = UnderlyingGraph::ref_cast(&self.0);
        Some(path.replace_subpath(graph, range, |subpath| self.0.compose(subpath).into()))
    }
}

impl<C: FgCategory + Validate> Validate for DiscreteDblTheory<C> {
    type ValidationError = C::ValidationError;

    fn validate(&self) -> Result<(), nonempty::NonEmpty<Self::ValidationError>> {
        self.0.validate()
    }
}

/// Object type in a discrete tabulator theory.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum TabObType<V, E> {
    /// Basic or generating object type.
    Basic(V),

    /// Tabulator of a morphism type.
    Tabulator(Box<TabMorType<V, E>>),
}

/// Morphism type in a discrete tabulator theory.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum TabMorType<V, E> {
    /// Basic or generating morphism type.
    Basic(E),

    /// Hom type on an object type.
    Hom(Box<TabObType<V, E>>),
}

/// Projection onto object type in a discrete tabulator theory.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TabObProj<V, E> {
    /// Projection from tabulator onto source of morphism type.
    Src(TabMorType<V, E>),

    /// Projection from tabulator onto target of morphism type.
    Tgt(TabMorType<V, E>),
}

impl<V, E> TabObProj<V, E> {
    /// Morphism type that the tabulator is of.
    pub fn mor_type(&self) -> &TabMorType<V, E> {
        match self {
            TabObProj::Src(m) | TabObProj::Tgt(m) => m,
        }
    }
}

/// Operation on objects in a discrete tabulator theory.
pub type TabObOp<V, E> = Path<TabObType<V, E>, TabObProj<V, E>>;

/// Projection onto morphism type in a discrete tabulator theory.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TabMorProj<V, E> {
    /// Projection from a tabulator onto the original morphism type.
    Cone(TabMorType<V, E>),

    /// Projection from tabulator onto source of morphism type.
    Src(TabMorType<V, E>),

    /// Projection from tabulator onto target of morphism type.
    Tgt(TabMorType<V, E>),
}

impl<V, E> TabMorProj<V, E> {
    /// Morphism type that the tabulator is of.
    pub fn mor_type(&self) -> &TabMorType<V, E> {
        match self {
            TabMorProj::Cone(m) | TabMorProj::Src(m) | TabMorProj::Tgt(m) => m,
        }
    }

    /// Source projection.
    fn src(self) -> TabObProj<V, E> {
        match self {
            TabMorProj::Cone(m) | TabMorProj::Src(m) => TabObProj::Src(m),
            TabMorProj::Tgt(m) => TabObProj::Tgt(m),
        }
    }

    /// Target projection
    fn tgt(self) -> TabObProj<V, E> {
        match self {
            TabMorProj::Src(m) => TabObProj::Src(m),
            TabMorProj::Cone(m) | TabMorProj::Tgt(m) => TabObProj::Tgt(m),
        }
    }
}

/// Operation on morphisms in a discrete tabulator theory.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TabMorOp<V, E> {
    dom: Path<TabObType<V, E>, TabMorType<V, E>>,
    projections: Vec<TabMorProj<V, E>>,
}

/** A discrete tabulator theory.

Loosely speaking, a discrete tabulator theory is a [discrete double
theory](DiscreteDblTheory) extended to allow tabulators. That doesn't quite make
sense as stated because a [tabulator](https://ncatlab.org/nlab/show/tabulator)
comes with two projection arrows and a projection cell, hence cannot exist in a
nontrivial discrete double category. A **discrete tabulator theory** is rather a
small double category with tabulators and with no arrows or cells beyond the
identities and tabulator projections.
 */
#[derive(Clone, Derivative)]
#[derivative(Default(bound = "S: Default"))]
pub struct DiscreteTabTheory<V, E, S = RandomState> {
    ob_types: HashFinSet<V, S>,
    mor_types: HashFinSet<E, S>,
    src: HashColumn<E, TabObType<V, E>, S>,
    tgt: HashColumn<E, TabObType<V, E>, S>,
    compose_map: HashColumn<(E, E), TabMorType<V, E>>,
}

/// Discrete tabulator theory with names of type `Ustr`.
pub type UstrDiscreteTabTheory = DiscreteTabTheory<Ustr, Ustr, BuildHasherDefault<IdentityHasher>>;

impl<V, E, S> DiscreteTabTheory<V, E, S>
where
    V: Eq + Clone + Hash,
    E: Eq + Clone + Hash,
    S: BuildHasher,
{
    /// Creates an empty discrete tabulator theory.
    pub fn new() -> Self
    where
        S: Default,
    {
        Default::default()
    }

    /// Constructs a tabulator of a morphism type.
    pub fn tabulator(&self, m: TabMorType<V, E>) -> TabObType<V, E> {
        TabObType::Tabulator(Box::new(m))
    }

    /// Constructs a unary projection cell for a tabulator.
    pub fn unary_projection(&self, proj: TabMorProj<V, E>) -> TabMorOp<V, E> {
        TabMorOp {
            dom: self.hom_type(self.tabulator(proj.mor_type().clone())).into(),
            projections: vec![proj],
        }
    }

    /// Adds a basic object type to the theory.
    pub fn add_ob_type(&mut self, v: V) -> bool {
        self.ob_types.insert(v)
    }

    /// Adds a basic morphism type to the theory.
    pub fn add_mor_type(&mut self, e: E, src: TabObType<V, E>, tgt: TabObType<V, E>) -> bool {
        self.src.set(e.clone(), src);
        self.tgt.set(e.clone(), tgt);
        self.make_mor_type(e)
    }

    /// Adds a basic morphim type without initializing its source or target.
    pub fn make_mor_type(&mut self, e: E) -> bool {
        self.mor_types.insert(e)
    }
}

/// Graph of objects and projection arrows in discrete tabulator theory.
#[derive(RefCast)]
#[repr(transparent)]
struct DiscTabTheoryProjGraph<V, E, S>(DiscreteTabTheory<V, E, S>);

impl<V, E, S> Graph for DiscTabTheoryProjGraph<V, E, S>
where
    V: Eq + Clone + Hash,
    E: Eq + Clone + Hash,
    S: BuildHasher,
{
    type V = TabObType<V, E>;
    type E = TabObProj<V, E>;

    fn has_vertex(&self, x: &Self::V) -> bool {
        self.0.has_ob(x)
    }
    fn has_edge(&self, proj: &Self::E) -> bool {
        self.0.has_proarrow(proj.mor_type())
    }

    fn src(&self, proj: &Self::E) -> Self::V {
        TabObType::Tabulator(Box::new(proj.mor_type().clone()))
    }
    fn tgt(&self, proj: &Self::E) -> Self::V {
        match proj {
            TabObProj::Src(m) => self.0.src(m),
            TabObProj::Tgt(m) => self.0.tgt(m),
        }
    }
}

impl<V, E, S> VDblCategory for DiscreteTabTheory<V, E, S>
where
    V: Eq + Clone + Hash,
    E: Eq + Clone + Hash,
    S: BuildHasher,
{
    type Ob = TabObType<V, E>;
    type Arr = TabObOp<V, E>;
    type Pro = TabMorType<V, E>;
    type Cell = TabMorOp<V, E>;

    fn has_ob(&self, ob: &Self::Ob) -> bool {
        match ob {
            TabObType::Basic(v) => self.ob_types.contains(v),
            TabObType::Tabulator(m) => self.has_proarrow(m),
        }
    }
    fn has_arrow(&self, path: &Self::Arr) -> bool {
        path.contained_in(DiscTabTheoryProjGraph::ref_cast(self))
    }
    fn has_proarrow(&self, pro: &Self::Pro) -> bool {
        match pro {
            TabMorType::Basic(e) => self.mor_types.contains(e),
            TabMorType::Hom(x) => self.has_ob(x),
        }
    }
    fn has_cell(&self, cell: &Self::Cell) -> bool {
        let graph = ProedgeGraph::ref_cast(UnderlyingDblGraph::ref_cast(self));
        if !cell.dom.contained_in(graph) {
            return false;
        }
        let (src, tgt) = (self.cell_src(cell), self.cell_tgt(cell));
        self.has_arrow(&src)
            && self.has_arrow(&tgt)
            && cell.dom.src(graph) == self.dom(&src)
            && cell.dom.tgt(graph) == self.dom(&tgt)
    }

    fn dom(&self, path: &Self::Arr) -> Self::Ob {
        path.src(DiscTabTheoryProjGraph::ref_cast(self))
    }
    fn cod(&self, path: &Self::Arr) -> Self::Ob {
        path.tgt(DiscTabTheoryProjGraph::ref_cast(self))
    }
    fn src(&self, m: &Self::Pro) -> Self::Ob {
        match m {
            TabMorType::Basic(e) => {
                self.src.apply(e).expect("Source of morphism type should be defined")
            }
            TabMorType::Hom(x) => (**x).clone(),
        }
    }
    fn tgt(&self, m: &Self::Pro) -> Self::Ob {
        match m {
            TabMorType::Basic(e) => {
                self.tgt.apply(e).expect("Target of morphism type should be defined")
            }
            TabMorType::Hom(x) => (**x).clone(),
        }
    }

    fn cell_dom(&self, cell: &Self::Cell) -> Path<Self::Ob, Self::Pro> {
        cell.dom.clone()
    }
    fn cell_cod(&self, cell: &Self::Cell) -> Self::Pro {
        self.composite(cell.dom.clone()).expect("Path should have a composite")
    }
    fn cell_src(&self, cell: &Self::Cell) -> Self::Arr {
        let graph = ProedgeGraph::ref_cast(UnderlyingDblGraph::ref_cast(self));
        Path::collect(cell.projections.iter().cloned().map(|proj| proj.src()))
            .unwrap_or_else(|| Path::empty(cell.dom.src(graph)))
    }
    fn cell_tgt(&self, cell: &Self::Cell) -> Self::Arr {
        let graph = ProedgeGraph::ref_cast(UnderlyingDblGraph::ref_cast(self));
        Path::collect(cell.projections.iter().cloned().map(|proj| proj.tgt()))
            .unwrap_or_else(|| Path::empty(cell.dom.tgt(graph)))
    }

    fn compose(&self, path: Path<Self::Ob, Self::Arr>) -> Self::Arr {
        path.flatten()
    }

    fn compose_cells(&self, tree: DblTree<Self::Arr, Self::Pro, Self::Cell>) -> Self::Cell {
        let graph = UnderlyingDblGraph::ref_cast(self);
        let dom = tree.dom(graph);
        let src = self.compose(tree.src(graph));
        let tgt = self.compose(tree.tgt(graph));
        assert_eq!(src.len(), tgt.len(), "Source/target boundaries should have equal length");
        let projections = std::iter::zip(src, tgt)
            .map(|pair| match pair {
                (TabObProj::Src(m), TabObProj::Tgt(n)) if m == n => TabMorProj::Cone(m),
                (TabObProj::Src(m), TabObProj::Src(n)) if m == n => TabMorProj::Src(m),
                (TabObProj::Tgt(m), TabObProj::Tgt(n)) if m == n => TabMorProj::Tgt(m),
                _ => panic!("Projection cells should have compatible source/target boundaries"),
            })
            .collect();
        TabMorOp { dom, projections }
    }
}

impl<V, E, S> VDCWithComposites for DiscreteTabTheory<V, E, S>
where
    V: Eq + Clone + Hash,
    E: Eq + Clone + Hash,
    S: BuildHasher,
{
    fn composite2(&self, m: Self::Pro, n: Self::Pro) -> Option<Self::Pro> {
        let mn = match (m, n) {
            (m, TabMorType::Hom(y)) if self.tgt(&m) == *y => m,
            (TabMorType::Hom(x), n) if self.src(&n) == *x => n,
            (TabMorType::Basic(d), TabMorType::Basic(e)) => {
                self.compose_map.apply(&(d, e)).expect("Composition should be defined")
            }
            _ => panic!("Ill-typed composite of morphism types in discrete tabulator theory"),
        };
        Some(mn)
    }
    fn unit(&self, x: Self::Ob) -> Option<Self::Pro> {
        Some(TabMorType::Hom(Box::new(x)))
    }
    fn composite(&self, path: Path<Self::Ob, Self::Pro>) -> Option<Self::Pro> {
        Some(path.reduce(|x| self.unit(x).unwrap(), |m, n| self.composite2(m, n).unwrap()))
    }

    fn composite_ext(&self, path: Path<Self::Ob, Self::Pro>) -> Option<Self::Cell> {
        Some(TabMorOp {
            dom: path,
            projections: vec![],
        })
    }

    fn through_composite(&self, cell: Self::Cell, range: Range<usize>) -> Option<Self::Cell> {
        let graph = ProedgeGraph::ref_cast(UnderlyingDblGraph::ref_cast(self));
        let TabMorOp { dom, projections } = cell;
        Some(TabMorOp {
            dom: dom.replace_subpath(graph, range, |sub| self.composite(sub).unwrap().into()),
            projections,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::one::{Path, fp_category::FpCategory};

    #[test]
    fn discrete_double_theory() {
        let mut sgn: FpCategory<char, char> = Default::default();
        sgn.add_ob_generator('*');
        sgn.add_mor_generator('n', '*', '*');
        sgn.equate(Path::pair('n', 'n'), Path::Id('*'));

        let th = DiscreteDblTheory::from(sgn);
        let sgn = th.category();
        assert!(th.has_ob_type(&'*'));
        assert!(th.has_mor_type(&'n'.into()));
        let path = Path::pair('n'.into(), 'n'.into());
        assert!(sgn.morphisms_are_equal(th.compose_types(path).unwrap(), Path::Id('*')));

        assert_eq!(th.hom_type('*'), Path::Id('*'));
        assert_eq!(th.hom_op('*'), Path::single(Path::Id('*')));
    }

    #[test]
    fn discrete_tabulator_theory() {
        let mut th = DiscreteTabTheory::<char, char>::new();
        th.add_ob_type('*');
        let x = TabObType::Basic('*');
        assert!(th.has_ob_type(&x));
        let tab = th.tabulator(th.hom_type(x.clone()));
        assert!(th.has_ob_type(&tab));
        assert!(th.has_mor_type(&th.hom_type(tab.clone())));

        th.add_mor_type('m', x.clone(), tab.clone());
        let m = TabMorType::Basic('m');
        assert!(th.has_mor_type(&m));
        assert_eq!(th.src_type(&m), x);
        assert_eq!(th.tgt_type(&m), tab);

        let proj = th.unary_projection(TabMorProj::Cone(th.hom_type(x.clone())));
        let cell = th.compose_cells2(
            [th.composite2_ext(th.hom_type(tab.clone()), th.hom_type(tab.clone())).unwrap()],
            proj.clone(),
        );
        assert!(th.has_mor_op(&cell));
        assert!(matches!(th.src_op(&cell).only(), Some(TabObProj::Src(_))));
        assert!(matches!(th.tgt_op(&cell).only(), Some(TabObProj::Tgt(_))));

        let proj_src = th.unary_projection(TabMorProj::Src(th.hom_type(x.clone())));
        let cell_alt = th.compose_cells2(
            [proj_src, proj],
            th.composite2_ext(th.hom_type(x.clone()), th.hom_type(x.clone())).unwrap(),
        );
        assert!(th.has_mor_op(&cell_alt));
        assert_eq!(cell, cell_alt);
    }
}
