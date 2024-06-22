/*! Pasting diagrams in double categories.

A [*pasting diagram*](https://ncatlab.org/nlab/show/pasting+diagram) in a
categorical structure is a diagram that specifies a unique composite. In a
category, a pasting diagram is nothing but a [path](crate::one::path), which is
why there is not much talk about one-dimensional pasting. In higher dimensions
the combinatorics of pasting is far more complicated.

This module is about pasting in double categories, a topic not well studied.
Such work as there is tends to be topological rather than combinatorial, which
provides little guidance about implementation. We follow the philosophy if not
the technical details of Makkai in regarding "the notion of *computad*... \[as\]
nothing but the precise notion of *higher-dimensional categorical diagram*" and
then singling out the pasting diagrams as those diagrams that admit a unique
top-dimensional composite (Makkai 2005; 2007). Thus, we will define a "double
pasting diagram" to be a [double diagram](super::diagram) with additional
constraining it to define a unique two-dimensional composite. This construction
seems to be original and is unfortunately not yet accompanied by a pasting
theorem establishing its correctness.

# References

- Makkai, 2005: The word problem for computads
- Makkai, 2007: Computads and 2-dimensional pasting diagrams
*/

use nonempty::NonEmpty;

use super::diagram::SkelDblDiagram;

/// TODO
pub struct DblPastingDiagram<Ob,Arr,Pro,Cell> {
    diagram: SkelDblDiagram<Ob,Arr,Pro,Cell>
}
