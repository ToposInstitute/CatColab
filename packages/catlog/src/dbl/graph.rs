//! Virtual double graphs.
//!
//! Analogous to how a graph is the combinatorial data that underlies a category, a
//! virtual double graph* (nonstandard term) is the combinatorial data that
//! underlies a virtual double category.
//!
//! In Leinster's terminology, a virtual double graph is called an *fc-graph*
//! ([Leinster 2004](crate::refs::HigherOperads), Section 5.1). A virtual double
//! graph is similar to a *double graph*, or two-dimensional semi-cubical set,
//! except that the top boundary is a directed path of proedges rather than a single
//! proedge.

use derive_more::From;
use ref_cast::RefCast;
use thiserror::Error;

use crate::one::{Graph, path::Path};

/// A virtual double graph, the data underlying a virtual double category.
///
/// Following our nomenclature for double categories, we say that an edge in a
/// double graph has a *domain* and *codomain*, whereas a proedge has a *source* and
/// a *target*. A square has all four of those.
pub trait VDblGraph {
    /// Type of vertices.
    type V: Eq + Clone;

    /// Type of edges, in tight direction.
    type E: Eq + Clone;

    /// Type of "pro-edges", or edges in the loose direction.
    type ProE: Eq + Clone;

    /// Type of squares with multi-ary domain.
    type Sq: Eq + Clone;

    /// Does the vertex belong to the double graph?
    fn has_vertex(&self, v: &Self::V) -> bool;

    /// Does the edge belong to the double graph?
    fn has_edge(&self, e: &Self::E) -> bool;

    /// Does the proedge belong to the double graph?
    fn has_proedge(&self, p: &Self::ProE) -> bool;

    /// Does the square belong to the double graph?
    fn has_square(&self, sq: &Self::Sq) -> bool;

    /// Gets the domain of an edge.
    fn dom(&self, e: &Self::E) -> Self::V;

    /// Gets the codomain of an edge.
    fn cod(&self, e: &Self::E) -> Self::V;

    /// Gets the source of a proedge.
    fn src(&self, p: &Self::ProE) -> Self::V;

    /// Gets the target of a proedge.
    fn tgt(&self, p: &Self::ProE) -> Self::V;

    /// Gets the domain of a square, a path of proedges.
    fn square_dom(&self, sq: &Self::Sq) -> Path<Self::V, Self::ProE>;

    /// Gets the codomain of a square, a single proedge.
    fn square_cod(&self, sq: &Self::Sq) -> Self::ProE;

    /// Gets the source of a square, an edge.
    fn square_src(&self, sq: &Self::Sq) -> Self::E;

    /// Gets the target of a square, an edge.
    fn square_tgt(&self, sq: &Self::Sq) -> Self::E;

    /// Gets the arity of a square.
    ///
    /// The default implementation returns the length of the square's domain.
    fn arity(&self, sq: &Self::Sq) -> usize {
        self.square_dom(sq).len()
    }
}

/// The underlying graph of vertices and edges in a virtual double graph.
///
/// Compare with [`ProedgeGraph`].
#[derive(From, RefCast)]
#[repr(transparent)]
pub struct EdgeGraph<VDG: VDblGraph>(VDG);

impl<VDG: VDblGraph> Graph for EdgeGraph<VDG> {
    type V = VDG::V;
    type E = VDG::E;

    fn has_vertex(&self, v: &Self::V) -> bool {
        self.0.has_vertex(v)
    }
    fn has_edge(&self, e: &Self::E) -> bool {
        self.0.has_edge(e)
    }
    fn src(&self, e: &Self::E) -> Self::V {
        self.0.dom(e)
    }
    fn tgt(&self, e: &Self::E) -> Self::V {
        self.0.cod(e)
    }
}

/// The underlying graph of vertices and pro-edges in a virtual double graph.
///
/// Compare with [`EdgeGraph`].
#[derive(From, RefCast)]
#[repr(transparent)]
pub struct ProedgeGraph<VDG: VDblGraph>(VDG);

impl<VDG: VDblGraph> Graph for ProedgeGraph<VDG> {
    type V = VDG::V;
    type E = VDG::ProE;

    fn has_vertex(&self, v: &Self::V) -> bool {
        self.0.has_vertex(v)
    }
    fn has_edge(&self, e: &Self::E) -> bool {
        self.0.has_proedge(e)
    }
    fn src(&self, e: &Self::E) -> Self::V {
        self.0.src(e)
    }
    fn tgt(&self, e: &Self::E) -> Self::V {
        self.0.tgt(e)
    }
}

/// An invalid assignment in a virtual double graph.
#[derive(Debug, Error)]
pub enum InvalidVDblGraph<E, ProE, Sq> {
    /// Edge with an invalid domain.
    #[error("Domain of edge `{0}` is not a vertex in the double graph")]
    Dom(E),

    /// Edge with an invalid codomain.
    #[error("Codomain of edge `{0}` is not a vertex in the double graph")]
    Cod(E),

    /// Proedge with an invalid source.
    #[error("Source of proedge `{0}` is not a vertex in the double graph")]
    Src(ProE),

    /// Proedge with an invalid target.
    #[error("Target of proedge `{0}` is not a vertex in the double graph")]
    Tgt(ProE),

    /// Square with an invalid domain.
    #[error("Domain of square `{0}` is not a proedge in the double graph")]
    SquareDom(Sq),

    /// Square with an invalid codomain.
    #[error("Codomain of square `{0}` is not a proedge in the double graph")]
    SquareCod(Sq),

    /// Square with an invalid source.
    #[error("Source of square `{0}` is not an edge in the double graph")]
    SquareSrc(Sq),

    /// Square with an invalid target.
    #[error("Target of cell `{0}` is not an edge in the double graph")]
    SquareTgt(Sq),

    /// Square with incompatible sides.
    #[error("Square `{0}` has sides with incompatible endpoints")]
    NotSquare(Sq),
}
