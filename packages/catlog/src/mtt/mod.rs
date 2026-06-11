//! TODO

mod arrow;
pub mod ast;
pub mod checker;
mod composite;

/// Helpers to make formatting more ergonomic when writing display
/// implementations.
pub mod display_helpers;

/// The theory trait, and zero-sized instances and implementations of various
/// theories.
pub mod theory;
