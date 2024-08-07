/*! References to the literature (docs only).

This module contains references cited in the docs for this crate. It is only
built when the crate is compiled with the `doc` feature and is not intended for
any purpose besides documentation.
 */

// NOTE: Preferably this data would be recorded in a structured way, e.g., as
// constant structs of some type `Reference`. This works fine in Rust but it
// doesn't produce usable docs because rustdoc doesn't display constants except
// in certain special cases.
//
// - https://github.com/rust-lang/rust/pull/98814
// - https://github.com/rust-lang/rust/issues/98929

/** Reference: Cartesian double theories.

Lambert & Patterson, 2024. Cartesian double theories: A double-categorical
framework for categorical doctrines.

- [DOI:10.1016/j.aim.2024.109630](https://doi.org/10.1016/j.aim.2024.109630)
- [arXiv:2310.05384](https://arxiv.org/abs/2310.05384)
 */
pub const CartDblTheories: () = ();

/** Reference: Products in double categories, revisited.

Patterson, 2024: Products in double categories, revisited.

- [arXiv:2401.08990](https://arxiv.org/abs/2401.08990)
 */
pub const DblProducts: () = ();
