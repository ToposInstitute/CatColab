/*! Simulation of dynamical systems.

"Modeling and simulation" is a major part of science and engineering. The
purpose of the `catlog` crate is to specify models using the machinery of
double-categorical logic. This module simulates dynamical systems derived from
models. It is intended as a stopgap pending interoperation with a language
having a better scientific computing ecosystem than Rust, such as Julia.
However, if it does stick around it should eventually become its own crate. For
now it's convenient to keep everything in the same place.
 */

#[cfg(feature = "ode")]
pub mod ode;
