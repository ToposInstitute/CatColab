/*! A toolbox for categorical logic based on double-categorical theories.

# Organization

While the purpose of this package is to implement double theories and their
models and morphisms, having a certain amount of lower-dimensional category
theory is inevitably useful as a foundation. For instance, the starting point
for a double graph or a [double computad](crate::dbl::computad) is a pair of
graphs that share a set of vertices. The package is organized into top-level
modules according to dimensionality:

0. [`zero`]: Sets and mappings, known semi-seriously as zero-dimensional
   category theory.
1. [`one`]: Ordinary, or one-dimensional, category theory.
2. [`dbl`]: Double category theory.

The foundational modules make no pretence to completeness, but if they become
sufficiently useful in their own right, they may be spun off into their own
packages.
*/

// Unicode identifiers.
#![allow(mixed_script_confusables)]
#![allow(confusable_idents)]

#![warn(missing_docs)]

pub mod validate;

pub mod zero;
pub mod one;
pub mod dbl;
pub mod stdlib;
