//! Discrete tabulator theories.

use std::hash::Hash;
use std::ops::Range;

use derive_more::From;
use ref_cast::RefCast;

use crate::dbl::{category::*, graph::ProedgeGraph, tree::DblTree};
use crate::one::{Graph, Path};
use crate::zero::*;

/// Object type in a discrete tabulator theory.
#[derive(Clone, Debug, PartialEq, Eq, Hash, From)]
pub enum TabObType {
    /// Basic or generating object type.
    #[from]
    Basic(QualifiedName),

    /// Tabulator of a morphism type.
    Tabulator(Box<TabMorType>),
}

impl std::fmt::Display for TabObType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let _ = match self {
            TabObType::Basic(x) => write!(f, "{x}"),
            TabObType::Tabulator(mor) => write!(f, "{mor}"),
        };
        Ok(())
    }
}

/// Morphism type in a discrete tabulator theory.
#[derive(Clone, Debug, PartialEq, Eq, Hash, From)]
pub enum TabMorType {
    /// Basic or generating morphism type.
    #[from]
    Basic(QualifiedName),

    /// Hom type on an object type.
    Hom(Box<TabObType>),
}

impl std::fmt::Display for TabMorType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let _ = match self {
            TabMorType::Basic(x) => write!(f, "{x}"),
            TabMorType::Hom(mor) => write!(f, "{mor}"),
        };
        Ok(())
    }
}

/// Projection onto object type in a discrete tabulator theory.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TabObProj {
    /// Projection from tabulator onto source of morphism type.
    Src(TabMorType),

    /// Projection from tabulator onto target of morphism type.
    Tgt(TabMorType),
}

impl TabObProj {
    /// Morphism type that the tabulator is of.
    pub fn mor_type(&self) -> &TabMorType {
        match self {
            TabObProj::Src(m) | TabObProj::Tgt(m) => m,
        }
    }
}

/// Operation on objects in a discrete tabulator theory.
pub type TabObOp = Path<TabObType, TabObProj>;

/// Projection onto morphism type in a discrete tabulator theory.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TabMorProj {
    /// Projection from a tabulator onto the original morphism type.
    Cone(TabMorType),

    /// Projection from tabulator onto source of morphism type.
    Src(TabMorType),

    /// Projection from tabulator onto target of morphism type.
    Tgt(TabMorType),
}

impl TabMorProj {
    /// Morphism type that the tabulator is of.
    pub fn mor_type(&self) -> &TabMorType {
        match self {
            TabMorProj::Cone(m) | TabMorProj::Src(m) | TabMorProj::Tgt(m) => m,
        }
    }

    /// Source projection.
    fn src(self) -> TabObProj {
        match self {
            TabMorProj::Cone(m) | TabMorProj::Src(m) => TabObProj::Src(m),
            TabMorProj::Tgt(m) => TabObProj::Tgt(m),
        }
    }

    /// Target projection
    fn tgt(self) -> TabObProj {
        match self {
            TabMorProj::Src(m) => TabObProj::Src(m),
            TabMorProj::Cone(m) | TabMorProj::Tgt(m) => TabObProj::Tgt(m),
        }
    }
}

/// Operation on morphisms in a discrete tabulator theory.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TabMorOp {
    dom: Path<TabObType, TabMorType>,
    projections: Vec<TabMorProj>,
}

/// A discrete tabulator theory.
///
/// Loosely speaking, a discrete tabulator theory is a [discrete double
/// theory](crate::dbl::theory::DiscreteDblTheory) extended to allow tabulators.
/// That doesn't quite make sense as stated because a
/// [tabulator](https://ncatlab.org/nlab/show/tabulator) comes with two projection
/// arrows and a projection cell, which cannot exist in a nontrivial discrete double
/// category. A **discrete tabulator theory** is thus a small double category with
/// tabulators and with no arrows or cells beyond the identities and tabulator
/// projections.
#[derive(Clone, Default)]
pub struct DiscreteTabTheory {
    ob_types: HashFinSet<QualifiedName>,
    mor_types: HashFinSet<QualifiedName>,
    src: HashColumn<QualifiedName, TabObType>,
    tgt: HashColumn<QualifiedName, TabObType>,
    compose_map: HashColumn<(QualifiedName, QualifiedName), TabMorType>,
}

impl DiscreteTabTheory {
    /// Creates an empty discrete tabulator theory.
    pub fn new() -> Self {
        Default::default()
    }

    /// Constructs a tabulator of a morphism type.
    pub fn tabulator(&self, m: TabMorType) -> TabObType {
        TabObType::Tabulator(Box::new(m))
    }

    /// Constructs a unary projection cell for a tabulator.
    pub fn unary_projection(&self, proj: TabMorProj) -> TabMorOp {
        TabMorOp {
            dom: self.unit(self.tabulator(proj.mor_type().clone())).unwrap().into(),
            projections: vec![proj],
        }
    }

    /// Adds a generating object type to the theory.
    pub fn add_ob_type(&mut self, v: QualifiedName) -> bool {
        self.ob_types.insert(v)
    }

    /// Adds a generating morphism type to the theory.
    pub fn add_mor_type(&mut self, e: QualifiedName, src: TabObType, tgt: TabObType) -> bool {
        self.src.set(e.clone(), src);
        self.tgt.set(e.clone(), tgt);
        self.make_mor_type(e)
    }

    /// Adds a generating morphim type without initializing its source/target.
    pub fn make_mor_type(&mut self, e: QualifiedName) -> bool {
        self.mor_types.insert(e)
    }
}

/// Graph of objects and projection arrows in discrete tabulator theory.
#[derive(RefCast)]
#[repr(transparent)]
struct DiscTabTheoryProjGraph(DiscreteTabTheory);

impl Graph for DiscTabTheoryProjGraph {
    type V = TabObType;
    type E = TabObProj;

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

impl VDblCategory for DiscreteTabTheory {
    type Ob = TabObType;
    type Arr = TabObOp;
    type Pro = TabMorType;
    type Cell = TabMorOp;

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
                self.src.apply_to_ref(e).expect("Source of morphism type should be defined")
            }
            TabMorType::Hom(x) => (**x).clone(),
        }
    }
    fn tgt(&self, m: &Self::Pro) -> Self::Ob {
        match m {
            TabMorType::Basic(e) => {
                self.tgt.apply_to_ref(e).expect("Target of morphism type should be defined")
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

impl VDCWithComposites for DiscreteTabTheory {
    fn composite2(&self, m: Self::Pro, n: Self::Pro) -> Option<Self::Pro> {
        let mn = match (m, n) {
            (m, TabMorType::Hom(y)) if self.tgt(&m) == *y => m,
            (TabMorType::Hom(x), n) if self.src(&n) == *x => n,
            (TabMorType::Basic(d), TabMorType::Basic(e)) => {
                self.compose_map.apply((d, e)).expect("Composition should be defined")
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
    use crate::dbl::theory::DblTheory;

    #[test]
    fn theory_interface() {
        let mut th = DiscreteTabTheory::new();
        th.add_ob_type(name("*"));
        let x = TabObType::Basic(name("*"));
        assert!(th.has_ob_type(&x));
        let tab = th.tabulator(th.hom_type(x.clone()));
        assert!(th.has_ob_type(&tab));
        assert!(th.has_mor_type(&th.hom_type(tab.clone())));

        th.add_mor_type(name("m"), x.clone(), tab.clone());
        let m = TabMorType::Basic(name("m"));
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
