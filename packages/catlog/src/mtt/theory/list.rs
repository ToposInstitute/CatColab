//! TODO: The list modality and the leaf-reindexings it sanctions.
use derive_more::Display;

// TODO: check this file

#[derive(Clone, Display, PartialEq)]
/// The kind of list modality in question.
pub enum ListVariant {
    /// The "ordinary" list modality.
    Planar,
    /// Lists up to permutation, also known as multi-sets.
    Symmetric,
    /// The cartesian list modality.
    Cartesian,
}

impl ListVariant {
    /// TODO: explain this encoding scheme
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
