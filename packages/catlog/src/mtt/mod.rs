/// Generic arrow containers for abstracting things which have a name, domain,
/// and codomain data.
pub mod arrow;

/// The AST which is produced by the parsing process and consumed by the
/// checker.
pub mod ast;

/// The type checking functionality, organised by the sort of thing being
/// checked.
pub mod checker;

/// Framework for dealing with items which may be linearly ordered subject to
/// compatibility conditions.
pub mod composite;

/// Helpers to make formatting more ergonomic when writing display
/// implementations.
pub mod display_helpers;

/// The theory trait, and zero-sized instances and implementations of various
/// theories.
pub mod theory;
