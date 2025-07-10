//! Computads in dimension one.

use std::hash::{BuildHasher, Hash};

use derivative::Derivative;
use derive_more::Constructor;

use super::graph::ColumnarGraph;
use crate::zero::*;

/** Top-dimensional data of a 1-computad.

Intended for use with [`Computad`].
 */
#[derive(Debug, Derivative)]
#[derivative(Default(bound = "S: Default"))]
pub struct ComputadTop<Ob, E, S> {
    edges: HashFinSet<E, S>,
    src: HashColumn<E, Ob, S>,
    tgt: HashColumn<E, Ob, S>,
}

impl<Ob, E, S> ComputadTop<Ob, E, S>
where
    Ob: Eq + Clone,
    E: Eq + Clone + Hash,
    S: BuildHasher,
{
    /// Adds an edge to the computad.
    pub fn add_edge(&mut self, e: E, src: Ob, tgt: Ob) -> bool {
        self.src.set(e.clone(), src);
        self.tgt.set(e.clone(), tgt);
        self.edges.insert(e)
    }
}

/// TODO
#[derive(Constructor)]
pub struct Computad<'a, Ob, ObSet, E, S> {
    objects: &'a ObSet,
    computad: &'a ComputadTop<Ob, E, S>,
}

impl<'a, Ob, ObSet, E, S> ColumnarGraph for Computad<'a, Ob, ObSet, E, S>
where
    Ob: Eq + Clone,
    ObSet: Set<Elem = Ob>,
    E: Eq + Clone + Hash,
    S: BuildHasher,
{
    type V = Ob;
    type E = E;
    type Vertices = ObSet;
    type Edges = HashFinSet<E, S>;
    type Src = HashColumn<E, Ob, S>;
    type Tgt = HashColumn<E, Ob, S>;

    fn vertex_set(&self) -> &Self::Vertices {
        self.objects
    }
    fn edge_set(&self) -> &Self::Edges {
        &self.computad.edges
    }
    fn src_map(&self) -> &Self::Src {
        &self.computad.src
    }
    fn tgt_map(&self) -> &Self::Tgt {
        &self.computad.tgt
    }
}
