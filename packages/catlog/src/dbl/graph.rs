/*! Virtual double graphs.

Analogous to how a graph is the combinatorial data that underlies a category, a
*virtual double graph* (nonstandard nomenclature) is the combinatorial data that
underlies a virtual double category. In Leinster's terminology, a virtual double
graph is an "fc-graph" ([Leinster 2004](crate::refs::HigherOperads), Section
5.1).

A virtual double graph is similar to a double graph (a two-dimensional
semi-cubical set) except that the top boundary is a directed path rather than a
single edge.
 */

use crate::one::path::Path;

/** A virtual double graph, the data underlying a virtual double category.

Following our nomenclature for double categories, we say that an edge in a
double graph has a *domain* and *codomain*, whereas a proedge has a *source* and
a *target*. A square has all four of those.
*/
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
    fn has_square(&self, α: &Self::Sq) -> bool;

    /// Gets the domain of an edge.
    fn dom(&self, e: &Self::E) -> Self::V;

    /// Gets the codomain of an edge.
    fn cod(&self, e: &Self::E) -> Self::V;

    /// Gets the source of a proedge.
    fn src(&self, p: &Self::ProE) -> Self::V;

    /// Gets the target of a proedge.
    fn tgt(&self, p: &Self::ProE) -> Self::V;

    /// Gets the domain of a square, a path of proedges.
    fn square_dom(&self, α: &Self::Sq) -> Path<Self::V, Self::ProE>;

    /// Gets the codomain of a square, a single proedge.
    fn square_cod(&self, α: &Self::Sq) -> Self::ProE;

    /// Gets the source of a square, an edge.
    fn square_src(&self, α: &Self::Sq) -> Self::E;

    /// Gets the target of a square, an edge.
    fn square_tgt(&self, α: &Self::Sq) -> Self::E;
}
