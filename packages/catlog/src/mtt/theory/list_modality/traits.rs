//! The [ListModality] trait.

/// The pure combinatorics of a list modality.
pub trait ListModality: 'static {
    /// The name of the modality in question.
    const NAME: &'static str;

    /// Whether the specified leaf map is admissible for this modality. This
    /// is the sole differentiator among planar, symmetric, and cartesian list
    /// modalities: it decides which reindexings of a list's leaf variables
    /// the modality allows at the cell level.
    fn admits_reindexing(target_leaf: &[usize], source_arity: usize) -> bool;
}
