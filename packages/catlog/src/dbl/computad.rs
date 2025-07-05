//! Computads for virtual double categories.

use std::hash::{BuildHasher, Hash};

use derivative::Derivative;
use derive_more::Constructor;

use super::graph::{InvalidVDblGraph, VDblGraph};
use crate::one::{Graph, Path, ReflexiveGraph, ShortPath};
use crate::zero::*;

/** Top-dimensional data of an augmented virtual double computad.

Intended for use with [`AVDCComputad`].
 */
#[derive(Debug, Derivative)]
#[derivative(Default(bound = "S: Default"))]
pub struct AVDCComputadTop<Ob, Arr, Pro, Sq, S> {
    squares: HashFinSet<Sq, S>,
    dom: HashColumn<Sq, Path<Ob, Pro>, S>,
    cod: HashColumn<Sq, ShortPath<Ob, Pro>, S>,
    src: HashColumn<Sq, Arr, S>,
    tgt: HashColumn<Sq, Arr, S>,
}

impl<Ob, Arr, Pro, Sq, S> AVDCComputadTop<Ob, Arr, Pro, Sq, S>
where
    Ob: Eq + Clone,
    Arr: Eq + Clone,
    Pro: Eq + Clone,
    Sq: Eq + Clone + Hash,
    S: BuildHasher,
{
    /// Adds a square to the double computad.
    pub fn add_square(
        &mut self,
        sq: Sq,
        dom: Path<Ob, Pro>,
        cod: ShortPath<Ob, Pro>,
        src: Arr,
        tgt: Arr,
    ) -> bool {
        self.dom.set(sq.clone(), dom);
        self.cod.set(sq.clone(), cod);
        self.src.set(sq.clone(), src);
        self.tgt.set(sq.clone(), tgt);
        self.squares.insert(sq)
    }
}

/// TODO
#[derive(Constructor)]
pub struct AVDCComputad<'a, Ob, Arr, Pro, ObSet, ArrGraph, ProGraph, Sq, S> {
    objects: &'a ObSet,
    arrows: &'a ArrGraph,
    proarrows: &'a ProGraph,
    computad: &'a AVDCComputadTop<Ob, Arr, Pro, Sq, S>,
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
        self.computad.tgt.apply_to_ref(sq).expect("Target of square should be defined")
    }
    fn arity(&self, sq: &Self::Sq) -> usize {
        self.computad.dom.get(sq).expect("Domain of square should be defined").len()
    }
}

impl<'a, Ob, Arr, Pro, ObSet, ArrGraph, ProGraph, Sq, S>
    AVDCComputad<'a, Ob, Arr, Pro, ObSet, ArrGraph, ProGraph, Sq, S>
where
    Ob: Eq + Clone,
    Arr: Eq + Clone,
    Pro: Eq + Clone,
    Sq: Eq + Clone + Hash,
    ArrGraph: Graph<V = Ob, E = Arr>,
    ProGraph: Graph<V = Ob, E = Pro>,
    S: BuildHasher,
{
    /** Iterates over failures to be a valid virtual double graph.

    Note that this method *assumes* that the graphs of objects and (pro)arrows
    are already valid. If that is in question, validate them first.
     */
    pub fn iter_invalid<E, ProE>(&self) -> impl Iterator<Item = InvalidVDblGraph<E, ProE, Sq>> {
        let cptd = self.computad;
        cptd.squares.iter().flat_map(|sq| {
            let (dom, cod) = (cptd.dom.get(&sq), cptd.cod.get(&sq));
            let (src, tgt) = (cptd.src.get(&sq), cptd.tgt.get(&sq));
            let mut errs = Vec::new();
            if !dom.is_some_and(|path| path.contained_in(self.proarrows)) {
                errs.push(InvalidVDblGraph::SquareDom(sq.clone()));
            }
            if !cod.is_some_and(|path| path.contained_in(self.proarrows)) {
                errs.push(InvalidVDblGraph::SquareCod(sq.clone()));
            }
            if !src.is_some_and(|f| self.arrows.has_edge(f)) {
                errs.push(InvalidVDblGraph::SquareSrc(sq.clone()));
            }
            if !tgt.is_some_and(|g| self.arrows.has_edge(g)) {
                errs.push(InvalidVDblGraph::SquareTgt(sq.clone()));
            }
            if errs.is_empty() {
                let (m, n, f, g) = (dom.unwrap(), cod.unwrap(), src.unwrap(), tgt.unwrap());
                if !(m.src(self.proarrows) == self.arrows.src(f)
                    && m.tgt(self.proarrows) == self.arrows.src(g)
                    && n.src(self.proarrows) == self.arrows.tgt(f)
                    && n.tgt(self.proarrows) == self.arrows.tgt(g))
                {
                    errs.push(InvalidVDblGraph::NotSquare(sq));
                }
            }
            errs.into_iter()
        })
    }
}
