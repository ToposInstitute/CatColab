//! Computads for double categories and virtual double categories.

use std::hash::{BuildHasher, Hash, RandomState};

use super::graph::VDblGraph;
use crate::one::{Graph, Path, ReflexiveGraph, ShortPath};
use crate::zero::*;

/// TODO
pub struct AVDCComputadSquares<Ob, Arr, Pro, Sq, S = RandomState> {
    pub squares: HashFinSet<Sq, S>,
    pub dom: HashColumn<Sq, Path<Ob, Pro>, S>,
    pub cod: HashColumn<Sq, ShortPath<Ob, Pro>, S>,
    pub src: HashColumn<Sq, Arr, S>,
    pub tgt: HashColumn<Sq, Arr, S>,
}

/// TODO
pub struct AVDCComputad<'a, Ob, Arr, Pro, ObSet, ArrGraph, ProGraph, Sq, S> {
    pub objects: &'a ObSet,
    pub arrows: &'a ArrGraph,
    pub proarrows: &'a ProGraph,
    pub computad: &'a AVDCComputadSquares<Ob, Arr, Pro, Sq, S>,
}

impl<'a, Ob, Arr, Pro, ObSet, ArrGraph, ProGraph, Sq, S> VDblGraph
    for AVDCComputad<'a, Ob, Arr, Pro, ObSet, ArrGraph, ProGraph, Sq, S>
where
    Ob: Eq + Clone,
    Arr: Eq + Clone,
    Pro: Eq + Clone,
    Sq: Eq + Clone + Hash,
    ObSet: Set<Elem = Ob>,
    ArrGraph: Graph<V = Ob, E = Arr>,
    ProGraph: ReflexiveGraph<V = Ob, E = Pro>,
    S: BuildHasher,
{
    type V = Ob;
    type E = Arr;
    type ProE = Pro;
    type Sq = Sq;

    fn has_vertex(&self, v: &Self::V) -> bool {
        self.objects.contains(v)
    }
    fn has_edge(&self, e: &Self::E) -> bool {
        self.arrows.has_edge(e)
    }
    fn has_proedge(&self, p: &Self::ProE) -> bool {
        self.proarrows.has_edge(p)
    }
    fn has_square(&self, sq: &Self::Sq) -> bool {
        self.computad.squares.contains(sq)
    }
    fn dom(&self, e: &Self::E) -> Self::V {
        self.arrows.src(e)
    }
    fn cod(&self, e: &Self::E) -> Self::V {
        self.arrows.tgt(e)
    }
    fn src(&self, p: &Self::ProE) -> Self::V {
        self.proarrows.src(p)
    }
    fn tgt(&self, p: &Self::ProE) -> Self::V {
        self.proarrows.tgt(p)
    }
    fn square_dom(&self, sq: &Self::Sq) -> Path<Self::V, Self::ProE> {
        self.computad.dom.apply_to_ref(sq).expect("Domain of square should be defined")
    }
    fn square_cod(&self, sq: &Self::Sq) -> Self::ProE {
        self.computad
            .cod
            .apply_to_ref(sq)
            .expect("Codomain of square should be defined")
            .to_edge_in(self.proarrows)
    }
    fn square_src(&self, sq: &Self::Sq) -> Self::E {
        self.computad.src.apply_to_ref(sq).expect("Source of square should be defined")
    }
    fn square_tgt(&self, sq: &Self::Sq) -> Self::E {
        self.computad.src.apply_to_ref(sq).expect("Target of square should be defined")
    }
    fn arity(&self, sq: &Self::Sq) -> usize {
        self.computad.dom.get(sq).expect("Domain of square should be defined").len()
    }
}
