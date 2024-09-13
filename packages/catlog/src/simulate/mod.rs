/*! Simulation of dynamical models.

"Modeling and simulation" is a big part of science and engineering. The purpose
of this crate to use specify models using the machinery of categorical logic.
This module provides simulation for certain kinds of models. If it sticks around
it should eventually become its own crate but for now it is convenient to keep
everything in the same place.
 */

pub mod mathexpr;

#[cfg(feature = "ode")]
pub mod dynamic_ode;

pub use self::mathexpr::*;
