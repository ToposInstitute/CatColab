//! The symmetric list modality [SymmetricListModality]. It admits bijective
//! leaf reindexings at the cell level.

use super::traits::ListModality;

/// The list modality corresponding to symmetric lists: leaves may be
/// permuted, but not duplicated or dropped.
pub struct SymmetricListModality;

impl ListModality for SymmetricListModality {
    const NAME: &'static str = "SymmetricList";
    fn admits_reindexing(target_leaf: &[usize], source_arity: usize) -> bool {
        if target_leaf.len() != source_arity {
            return false;
        }
        let mut seen = vec![false; source_arity];
        for &j in target_leaf {
            match seen.get_mut(j) {
                Some(slot) if *slot => return false,
                Some(slot) => *slot = true,
                None => return false,
            }
        }
        true
    }
}
