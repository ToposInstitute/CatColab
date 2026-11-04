//! The planar list modality [PlanarListModality]. It admits only the
//! identity leaf reindexing at the cell level.

use super::traits::ListModality;

/// The list modality corresponding to planar lists: leaves may not be
/// reordered, duplicated, or dropped.
pub struct PlanarListModality;

impl ListModality for PlanarListModality {
    const NAME: &'static str = "PlanarList";
    fn admits_reindexing(target_leaf: &[usize], source_arity: usize) -> bool {
        target_leaf.len() == source_arity && target_leaf.iter().enumerate().all(|(i, &j)| i == j)
    }
}
