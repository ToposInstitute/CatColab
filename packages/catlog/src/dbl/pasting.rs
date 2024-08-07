/*! Pasting diagrams in double categories.

A [*pasting diagram*](https://ncatlab.org/nlab/show/pasting+diagram) in a
categorical structure is a diagram that specifies a unique composite. In a
category, a pasting diagram is simply a [path](crate::one::path), which is why
people don't talk much about one-dimensional pasting. In higher dimensions the
combinatorics of pasting is much more complicated.

This module is about pasting in double categories, a topic not well studied.
Such work as there is tends to be topological rather than combinatorial, which
provides little guidance about implementation. We follow the philosophy if not
the technical details of Makkai in regarding "the notion of *computad*... \[as\]
nothing but the precise notion of *higher-dimensional categorical diagram*" and
singling out the pasting diagrams as those diagrams that admit a unique
top-dimensional composite ([Makkai 2005](crate::refs::MakkaiComputads);
[2007](crate::refs::MakkaiComputadsPasting)). Thus, we define a "double pasting
diagram" to be a [double diagram](super::diagram) with additional data
constraining it to have a unique composite cell. This construction seems to be
original and is unfortunately not yet accompanied by a pasting theorem
establishing its correctness.
 */

use nonempty::NonEmpty;

use super::diagram::{DblDiagram, SkelDblDiagram};
use crate::one::path::Path;

/** A pasting in a double category, with specialization for identity cells.

Like our data structure for [paths](crate::one::path::Path) in a category, this
data structure separates the identity cells specified by lower-dimensional data
as variants of an enum, even though in this case the final variant does actually
encompass the others. However, the data of a generic identity cell is so much
simpler than a general composite that the redundancy seems justified.
*/
#[allow(clippy::large_enum_variant)]
pub enum DblPasting<Ob, Arr, Pro, Cell> {
    /// Identity cell on an object.
    ObId(Ob),

    /// Identity cell on a nonempty path of arrows.
    ArrId(NonEmpty<Arr>),

    /// Identity cell on a nonempty path of proarrows.
    ProId(NonEmpty<Pro>),

    /// General composite cell specified by a double pasting diagram.
    Diagram(DblPastingDiagram<Ob, Arr, Pro, Cell>),
}

/// Reference to edge or proedge in boundary of square in pasting diagram.
#[allow(dead_code)] // FIXME
enum BoundaryRef {
    Inner { square: usize, index: usize },
    Outer(usize),
}

/** A pasting diagram in a double category.

The data structure consists of a double diagram along with back references

- from each edge to the unique squares that it is source or target of
- from each proedge to the unique squares that it is the domain or codomain of

This is essentially the [quad-edge](https://en.wikipedia.org/wiki/Quad-edge)
data structure used in computer graphics.
*/
#[allow(dead_code)] // FIXME
pub struct DblPastingDiagram<Ob, Arr, Pro, Cell> {
    diagram: SkelDblDiagram<Ob, Arr, Pro, Cell>,
    dom: Path<usize, usize>,
    cod: Path<usize, usize>,
    src: Path<usize, usize>,
    tgt: Path<usize, usize>,
    dom_of: Vec<BoundaryRef>,
    cod_of: Vec<BoundaryRef>,
    src_of: Vec<BoundaryRef>,
    tgt_of: Vec<BoundaryRef>,
}

impl<Ob, Arr, Pro, Cell> DblPastingDiagram<Ob, Arr, Pro, Cell>
where
    Ob: Eq + Clone,
    Arr: Eq + Clone,
    Pro: Eq + Clone,
    Cell: Eq + Clone,
{
    /// Domain of pasting diagram, a path of arrows.
    pub fn dom(&self) -> Path<Ob, Arr> {
        self.dom.clone().map(|x| self.diagram.object(&x), |f| self.diagram.arrow(&f))
    }
    // TODO
}
