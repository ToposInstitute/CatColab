//! Computads in dimension one.
//!
//! A 1-computad, in the strictest sense of the term, is the generating data for a
//! free category, which is just a [graph](super::graph). This module provides
//! simple data structures to aid in defining computads for categories with extra
//! structure. For example, a computad for monoidal categories is called a "tensor
//! scheme" by Joyal and Street and a "pre-net" in the Petri net literature.

use std::hash::Hash;

use derivative::Derivative;
use derive_more::Constructor;

use super::graph::ColumnarGraph;
use crate::zero::*;

/// Top-dimensional data of a 1-computad.
///
/// Intended for use with [`Computad`].
#[derive(Clone, Debug, Derivative)]
#[derivative(Default(bound = ""))]
pub struct ComputadTop<Ob, E> {
    /// Set of edges in the computad.
    pub edge_set: HashFinSet<E>,

    /// Source map of the computad.
    pub src_map: HashColumn<E, Ob>,

    /// Target map of the computad.
    pub tgt_map: HashColumn<E, Ob>,
}

impl<Ob, E> ComputadTop<Ob, E>
where
    Ob: Eq + Clone,
    E: Eq + Clone + Hash,
{
    /// Adds an edge to the computad.
    pub fn add_edge(&mut self, e: E, src: Ob, tgt: Ob) -> bool {
        self.src_map.set(e.clone(), src);
        self.tgt_map.set(e.clone(), tgt);
        self.edge_set.insert(e)
    }
}

/// A 1-computad.
///
/// The set of objects is assumed already constructed, possibly from other
/// generating data, while the top-dimensional generating data is provided directly.
#[derive(Constructor)]
pub struct Computad<'a, Ob, ObSet, E> {
    objects: &'a ObSet,
    computad: &'a ComputadTop<Ob, E>,
}

impl<'a, Ob, ObSet, E> ColumnarGraph for Computad<'a, Ob, ObSet, E>
where
    Ob: Eq + Clone,
    ObSet: Set<Elem = Ob>,
    E: Eq + Clone + Hash,
{
    type V = Ob;
    type E = E;
    type Vertices = ObSet;
    type Edges = HashFinSet<E>;
    type Src = HashColumn<E, Ob>;
    type Tgt = HashColumn<E, Ob>;

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
