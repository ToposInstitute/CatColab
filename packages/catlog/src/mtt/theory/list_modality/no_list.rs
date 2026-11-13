//! [NoListModality] for theories that do not have a list modality. Uninhabited;
//! used as `type ListModality = NoListModality` on such theories, and detected
//! by [Theory::has_list_modality] via a `TypeId` comparison.

use super::traits::ListModality;

/// An unconstructable type representing the abscence of a list modality.
pub enum NoListModality {}

impl ListModality for NoListModality {
    const NAME: &'static str = "(no list modality)";
    fn admits_reindexing(_: &[usize], _: usize) -> bool {
        false
    }
}
