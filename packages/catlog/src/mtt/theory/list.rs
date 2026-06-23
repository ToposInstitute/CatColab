//! List modalities and the leaf reindexings they admit.

//! The abstraction of a list modality is designed to encompass all of the
//! combinatorics of pure structure that would otherwise be borne by a monad,
//! and its own generators and relations presentation. To do so we equip
//! [ListVariant] below with the decision procedures to judge "re-indexings" as
//! admissable. These decision procedures are not concerned with list "shapes"
//! but only with element indices and arities. For example the lists
//! `[[x],y,[[z]]]` and `[x,y,z]` have different "shapes" but have the same
//! "indices" and "arity".

//! A re-indexing is encoded by an array of indices whose i-th entry names the
//! index of the source leaf used for the i-th target leaf. Combined with
//! knowing the source and target shapes, this is enough information to encode
//! arbitrary list "manipulations". For example, if the source arity were 3 then
//! `[2, 0, 2]` would mean "copy source leaves 2, 0, and 2 into the three target
//! positions and discard source leaf 1".
use derive_more::Display;

/// The kind of list modality in question.
#[derive(Clone, Display, PartialEq)]
pub enum ListVariant {
    /// The "ordinary" list modality.
    Planar,
    /// Lists up to permutation, also known as multi-sets.
    Symmetric,
    /// The cartesian list modality.
    Cartesian,
}

impl ListVariant {
    /// Whether this modality permits the encoded leaf map.
    ///
    /// `target_leaf[i]` is the source leaf placed at target position `i`.
    /// Planar lists admit only the identity, symmetric lists admit exactly
    /// permutations, and cartesian lists admit any in-range map (so leaves may
    /// be copied, dropped, or reordered).
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
            Some(slot) if *slot => return false,
            Some(slot) => *slot = true,
            None => return false,
        }
    }
    true
}
