//! The list modality and the leaf-reindexings it sanctions.
//!
//! A theory supports at most one list modality, whose flavour is recorded by
//! [ListVariant]. The modality is the *only* arbiter of which list
//! manipulations are legal: rather than reconstruct the list-monad structure as
//! cells and restrictions in the theory, a
//! [ProTerm::ListManipulation](crate::mtt::checker::ProTerm::ListManipulation)
//! carries that structure in its leaf map and asks the modality whether the map
//! is admissible. All vertical list-monad components are thereby bypassed: no
//! μ/η cells, no restriction niches, and pro-arrow composites are kept in the
//! canonical form `List P ; P` rather than rewritten to a restricted `P(μ, 1)`.
//!
//! Two kinds of operation must be carefully distinguished:
//!
//! - The list-monad **structure maps** --- multiplication μ (flattening nested
//!   lists), nesting, and the unit η (inserting singleton or empty lists) ---
//!   are part of *every* list modality, planar included. They are always
//!   available and are never gated by the variant.
//! - The **leaf reindexing** --- reordering, duplicating, or dropping the
//!   leaves of a flattened list --- *is* what the variant governs.
//!
//! The two are orthogonal because the structure maps reshape the tree without
//! disturbing its flattened sequence of leaves: a flatten, a nest, or an
//! empty-list insertion all leave the leaf sequence pointwise fixed. Hence,
//! working at the level of flattened leaves, the structure maps contribute the
//! identity leaf reindexing and are admissible under any variant; only genuine
//! reordering / duplication / dropping is constrained. This is why
//! [ListVariant::admits_reindexing] judges a leaf map alone: the structure maps
//! are presumed already absorbed into the flattening, and are always legal.

use derive_more::Display;

#[derive(Clone, Display, PartialEq)]
/// The kind of list modality in question. Every variant carries the full
/// list-monad structure (flatten, nest, insert empty/singleton); the variant
/// fixes only which *leaf reindexings* are additionally sanctioned --- see
/// [ListVariant::admits_reindexing].
pub enum ListVariant {
    /// The "ordinary" list modality. Leaves are used exactly once and in
    /// declared order: beyond the always-available structure maps, no leaf
    /// reindexing is admitted (the leaf map must be the identity).
    Planar,
    /// Lists up to permutation, also known as multi-sets. Reorderings are
    /// admitted, but no leaf may be duplicated or dropped.
    Symmetric,
    /// The cartesian list modality. Any function on leaves is admitted:
    /// reorderings, duplications, and drops are all allowed.
    Cartesian,
}

impl ListVariant {
    /// Decide whether a leaf reindexing is admissible for this modality.
    ///
    /// This judges the leaf map *alone*. The list-monad structure maps
    /// (flattening, nesting, empty/singleton insertion) are presumed already
    /// absorbed by flattening both sides to their leaf sequences, where they
    /// contribute the identity and are admissible under every variant; they are
    /// never the subject of this check. What remains --- and what the variant
    /// governs --- is whether leaves may be reordered, duplicated, or dropped.
    ///
    /// A reindexing is described by `target_leaf` together with the number of
    /// leaves `source_arity` available to draw from. The convention, matching
    /// [ProTerm::ListManipulation](crate::mtt::checker::ProTerm::ListManipulation),
    /// is that the result has `target_leaf.len()` leaves and the leaf at target
    /// position `i` is the source leaf with index `target_leaf[i]`; thus
    /// `target_leaf` is the graph of a function `[target] → [source]`. The
    /// modality constrains which such functions are allowed:
    ///
    /// - [Planar](ListVariant::Planar): the identity, i.e. `target_leaf` is
    ///   `[0, 1, …, source_arity − 1]` (in particular the arities agree). Order
    ///   and multiplicity are both fixed.
    /// - [Symmetric](ListVariant::Symmetric): a bijection, i.e. `target_leaf`
    ///   is a permutation of `0..source_arity`. Order is free; multiplicity is
    ///   fixed.
    /// - [Cartesian](ListVariant::Cartesian): an arbitrary function, i.e. every
    ///   entry is a valid source index. Duplications and drops are both free.
    pub fn admits_reindexing(&self, target_leaf: &[usize], source_arity: usize) -> bool {
        match self {
            ListVariant::Planar => {
                target_leaf.len() == source_arity
                    && target_leaf.iter().enumerate().all(|(i, &j)| i == j)
            }
            ListVariant::Symmetric => {
                target_leaf.len() == source_arity && is_permutation(target_leaf, source_arity)
            }
            ListVariant::Cartesian => target_leaf.iter().all(|&j| j < source_arity),
        }
    }
}

/// Decide whether `leaves` is a permutation of `0..arity`, i.e. uses every
/// source index exactly once.
fn is_permutation(leaves: &[usize], arity: usize) -> bool {
    if leaves.len() != arity {
        return false;
    }
    let mut seen = vec![false; arity];
    for &j in leaves {
        match seen.get_mut(j) {
            // Already used this source leaf, so it is not a permutation.
            Some(slot) if *slot => return false,
            Some(slot) => *slot = true,
            // Index out of range.
            None => return false,
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::ListVariant::{Cartesian, Planar, Symmetric};

    #[test]
    fn planar_admits_only_the_identity() {
        assert!(Planar.admits_reindexing(&[0, 1, 2], 3));
        // Reordering is not planar.
        assert!(!Planar.admits_reindexing(&[1, 0, 2], 3));
        // Duplication and drop are not planar.
        assert!(!Planar.admits_reindexing(&[0, 0, 1], 2));
        assert!(!Planar.admits_reindexing(&[0, 1], 3));
    }

    #[test]
    fn symmetric_admits_permutations_only() {
        assert!(Symmetric.admits_reindexing(&[0, 1, 2], 3));
        assert!(Symmetric.admits_reindexing(&[2, 0, 1], 3));
        // Duplication is not a permutation.
        assert!(!Symmetric.admits_reindexing(&[0, 0, 1], 2));
        // Dropping a leaf is not a permutation.
        assert!(!Symmetric.admits_reindexing(&[0, 1], 3));
        // Out-of-range index.
        assert!(!Symmetric.admits_reindexing(&[0, 1, 3], 3));
    }

    #[test]
    fn cartesian_admits_any_function() {
        assert!(Cartesian.admits_reindexing(&[0, 1, 2], 3));
        // Reorder, duplicate, and drop are all admissible.
        assert!(Cartesian.admits_reindexing(&[2, 0, 1], 3));
        assert!(Cartesian.admits_reindexing(&[0, 0, 1], 2));
        assert!(Cartesian.admits_reindexing(&[0], 3));
        assert!(Cartesian.admits_reindexing(&[], 3));
        // Only out-of-range indices are rejected.
        assert!(!Cartesian.admits_reindexing(&[0, 3], 3));
    }
}
