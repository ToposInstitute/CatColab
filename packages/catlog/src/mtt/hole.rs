//! Inductive types carrying a "hole" variant: a bare wildcard standing in for
//! an as-yet-unknown value during checking and inference.

/// A type with a canonical unconstrained value: a bare hole carrying no
/// information of its own.
pub trait Holy {
    /// An unconstrained value, tagged with `name` for diagnostics.
    fn unconstrained(name: String) -> Self;

    /// Is this value a Hole?
    fn is_hole(&self) -> bool;
}
