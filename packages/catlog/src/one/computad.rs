//! Computads in dimension one.

use std::hash::{BuildHasher, Hash, RandomState};

use super::graph::ColumnarGraph;
use crate::zero::*;

/// TODO
pub struct ComputadEdges<Ob, E, S = RandomState> {
    edges: HashFinSet<E, S>,
    src: HashColumn<E, Ob, S>,
    tgt: HashColumn<E, Ob, S>,
}

/// TODO
pub struct Computad<'a, Ob, ObSet, E, S>(pub &'a ObSet, pub &'a ComputadEdges<Ob, E, S>);

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
        self.0
    }
    fn edge_set(&self) -> &Self::Edges {
        &self.1.edges
    }
    fn src_map(&self) -> &Self::Src {
        &self.1.src
    }
    fn tgt_map(&self) -> &Self::Tgt {
        &self.1.tgt
    }
}
