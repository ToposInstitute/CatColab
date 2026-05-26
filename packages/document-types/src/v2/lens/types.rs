use std::collections::HashSet;
use uuid::Uuid;

use crate::v0::model_judgment::ModelJudgment;

pub type FormalContent = Vec<ModelJudgment>;

pub enum FormalContentChange {
    Upsert(ModelJudgment),
    Remove(Uuid),
}

pub struct FormalContentDelta(Vec<FormalContentChange>);

impl IntoIterator for FormalContentDelta {
    type Item = FormalContentChange;
    type IntoIter = std::vec::IntoIter<Self::Item>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

impl<'a> IntoIterator for &'a FormalContentDelta {
    type Item = &'a FormalContentChange;
    type IntoIter = std::slice::Iter<'a, FormalContentChange>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.iter()
    }
}

impl FormalContentDelta {
    /// Compute a diff in FormalContent space.
    pub fn diff(old: &[ModelJudgment], new: &[ModelJudgment]) -> Self {
        let old_ids: HashSet<Uuid> = old.iter().map(|j| j.id()).collect();
        let new_ids: HashSet<Uuid> = new.iter().map(|j| j.id()).collect();

        let mut changes = Vec::new();

        for j in new {
            if old_ids.contains(&j.id()) {
                // this code could be made more efficient in the future to avoid
                // this iteration cost, but for now we assume that the models
                // are small and O(N) is acceptable.
                if let Some(old_j) = old.iter().find(|o| o.id() == j.id()) {
                    // Because we are using structural equality, if for whatever
                    // reason we have non-trivial equalities in the model/theory
                    // and we see the same data under different presentations we
                    // will produce an upsert.
                    if old_j != j {
                        changes.push(FormalContentChange::Upsert(j.clone()));
                    }
                }
            } else {
                changes.push(FormalContentChange::Upsert(j.clone()));
            }
        }

        for j in old {
            if !new_ids.contains(&j.id()) {
                changes.push(FormalContentChange::Remove(j.id()));
            }
        }

        FormalContentDelta(changes)
    }
}

/// An approximate model of a delta lens on FormalContent for a given Rust type.
/// In the words of Dana Scott, "just because you call something something,
/// doesn't make it that." We trust that the reader's generosity will exceed
/// their rigour.
pub trait FormalContentDeltaLens {
    /// Extract the formal content from a container.
    fn to_formal_content(&self) -> FormalContent;
    /// Given a diff in formal content space, update the container.
    fn apply_delta(&mut self, delta: &FormalContentDelta);
}
