//! The cartesian list modality [CartesianListModality]. It admits arbitrary
//! leaf reindexings at the cell level.

use super::traits::ListModality;

/// The list modality corresponding to cartesian lists: leaves may be
/// permuted, duplicated, or dropped.
pub struct CartesianListModality;

impl ListModality for CartesianListModality {
    const NAME: &'static str = "CartesianList";
    fn admits_reindexing(target_leaf: &[usize], source_arity: usize) -> bool {
        target_leaf.iter().all(|&j| j < source_arity)
    }
}
