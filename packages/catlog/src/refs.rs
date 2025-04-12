/*! References to the literature (docs only).

This module contains references cited in the docs for this crate. It is compiled
only when the crate the `doc` feature is enabled, and it is not intended to be
used for any purpose besides documentation.
 */

// NOTE: It would be fun to record bibliographic data in a structured way, e.g.,
// as constant structs of some type `Reference`. This works fine in Rust but it
// doesn't produce usable docs because rustdoc doesn't display constants except
// in certain special cases.
//
// - https://github.com/rust-lang/rust/pull/98814
// - https://github.com/rust-lang/rust/issues/98929

/** Reference: Cartesian double theories.

Michael Lambert & Evan Patterson, 2024. Cartesian double theories: A
double-categorical framework for categorical doctrines.

- [DOI:10.1016/j.aim.2024.109630](https://doi.org/10.1016/j.aim.2024.109630)
- [arXiv:2310.05384](https://arxiv.org/abs/2310.05384)
 */
pub const CartDblTheories: () = ();

/** Reference: Products in double categories, revisited.

Evan Patterson, 2024: Products in double categories, revisited.

- [arXiv:2401.08990](https://arxiv.org/abs/2401.08990)
 */
pub const DblProducts: () = ();

/** Reference: A unified framework for generalized multicategories.

G.S.H. Cruttwell & Michael Shulman, 2010: A unified framework for generalized
multicategories.

- [arXiv:0907.2460](https://arxiv.org/abs/0907.2460)
- [TAC](http://www.tac.mta.ca/tac/volumes/24/21/24-21.pdf)
 */
pub const GeneralizedMulticategories: () = ();

/** Reference: *Higher operads, higher categories*.

Tom Leinster, 2004: *Higher operads, higher categories*. Cambridge University
Press.

- [DOI:10.1017/CBO9780511525896](https://doi.org/10.1017/CBO9780511525896)
- [arXiv:math/0305049](https://arxiv.org/abs/math/0305049)
 */
pub const HigherOperads: () = ();

/** Reference: Compositional account of biochemical regulatory networks.

Rebekah Aduddell, James Fairbanks, Amit Kumar, Pablo S. Ocal, Evan Patterson,
Brandon T. Shapiro, 2024: A compositional account of motifs, mechanisms, and
dynamics in biochemical regulatory networks.

- [DOI:10.32408/compositionality-6-2](https://doi.org/10.32408/compositionality-6-2)
- [arXiv:2301.01445](https://arxiv.org/abs/2301.01445)
 */
pub const RegNets: () = ();

/** Reference: Compositional modeling with stock and flow diagrams.

John Baez, Xiaoyan Li, Sophie Libkind, Nathaniel Osgood, Evan Patterson, 2023:
Compositional modeling with stock and flow diagrams.

- [DOI:10.4204/EPTCS.380.5](https://doi.org/10.4204/EPTCS.380.5)
- [arXiv:2205.08373](https://arxiv.org/abs/2205.08373)
 */
pub const StockFlow: () = ();

/** Reference: *Ideals, varieties, and algorithms*.

David A. Cox, John B. Little, Don O'Shea, 2015. *Ideals, varieties, and
algorithms*. Fourth edition.

- [DOI:10.1007/978-3-319-16721-3](https://doi.org/10.1007/978-3-319-16721-3)
- [Companion website](https://dacox.people.amherst.edu/iva.html)
 */
pub const IdealsVarietiesAlgorithms: () = ();

/** Reference: Polynomial functors and trees.

Joachim Kock, 2011. Polynomial functors and trees.

- [DOI:10.1093/imrn/rnq068](https://doi.org/10.1093/imrn/rnq068)
- [arXiv:0807.2874](https://arxiv.org/abs/0807.2874)
 */
pub const KockTrees: () = ();

/** Reference: Graphs, hypergraphs, and properads.

Joachim Kock, 2016. Graphs, hypergraphs, and properads.

- [DOI:10.1007/s13348-015-0160-0](https://doi.org/10.1007/s13348-015-0160-0)
- [arXiv:1407.3744](https://arxiv.org/abs/1407.3744)
 */
pub const KockGraphs: () = ();
