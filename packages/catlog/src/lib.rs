/*! A toolbox for categorical logic based on double-categorical theories.

# Organization

While the purpose of this package is to implement double theories and their
models and morphisms, a certain amount of lower-dimensional category theory is
necessary as background. The package is organized into top-level modules
according to dimensionality:

0. [`zero`]: Sets and mappings, known semi-seriously as zero-dimensional
   category theory, and a bit of abstract algebra.
1. [`one`]: Ordinary, or one-dimensional, category theory.
2. [`dbl`]: Double category theory.

The prerequisite modules make no pretence to completeness, but if they become
sufficiently useful in their own right, they may be spun off into their own
crates.
*/

// Unicode identifiers.
#![allow(mixed_script_confusables)]
#![allow(confusable_idents)]
#![warn(missing_docs)]
#![allow(
    clippy::missing_panics_doc,
    clippy::needless_pass_by_value,
    clippy::missing_errors_doc,
    clippy::must_use_candidate,
    clippy::return_self_not_must_use
)]

#[cfg(doc)]
pub mod refs;

pub mod egglog_util;
pub mod validate;

pub mod dbl;
pub mod one;
pub mod simulate;
pub mod stdlib;
pub mod zero;
