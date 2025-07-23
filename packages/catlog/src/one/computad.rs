/*! Computads in dimension one.

A 1-computad, in the strictest sense of the term, is the generating data for a
free category, which is just a [graph](super::graph). This module provides
simple data structures to aid in defining computads for categories with extra
structure. For example, a computad for monoidal categories is called a "tensor
scheme" by Joyal and Street and a "pre-net" in the Petri net literature.
 */

use std::hash::{BuildHasher, Hash, RandomState};

use derivative::Derivative;
use derive_more::Constructor;

use super::graph::ColumnarGraph;
use crate::zero::*;

/** Top-dimensional data of a 1-computad.

Intended for use with [`Computad`].
 */
#[derive(Clone, Debug, Derivative)]
#[derivative(Default(bound = "S: Default"))]
pub struct ComputadTop<Ob, E, S = RandomState> {
    /// Set of edges in the computad.
    pub edge_set: HashFinSet<E, S>,

    /// Source map of the computad.
    pub src_map: HashColumn<E, Ob, S>,

    /// Target map of the computad.
    pub tgt_map: HashColumn<E, Ob, S>,
}

impl<Ob, E, S> ComputadTop<Ob, E, S>
where
    Ob: Eq + Clone,
    E: Eq + Clone + Hash,
    S: BuildHasher,
{
    /// Adds an edge to the computad.
    pub fn add_edge(&mut self, e: E, src: Ob, tgt: Ob) -> bool {
        self.src_map.set(e.clone(), src);
        self.tgt_map.set(e.clone(), tgt);
        self.edge_set.insert(e)
    }
}

/** A 1-computad.

The set of objects is assumed already constructed, possibly from other
generating data, while the top-dimensional generating data is provided directly.
 */
#[derive(Constructor)]
pub struct Computad<'a, Ob, ObSet, E, S = RandomState> {
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
        &self.computad.edge_set
    }
    fn src_map(&self) -> &Self::Src {
        &self.computad.src_map
    }
    fn tgt_map(&self) -> &Self::Tgt {
        &self.computad.tgt_map
    }
}
