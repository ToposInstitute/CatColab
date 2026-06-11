use crate::mtt::{
    checker::{TheoryObject, error::EConstraint},
    theory::Theory,
};

/// Operations concerning the partial knowledge we accumulate about a
/// [TheoryObject] during checking and inference. These all exploit the fact
/// that a TheoryObject is a linear chain --- modal applications terminating in
/// a generator or a hole --- so there is never complementary partial
/// information to merge.

impl<T: Theory> TheoryObject<T> {
    /// Among a collection of candidates, select the most specific, i.e. the one
    /// whose concrete modal prefix runs deepest before bottoming out in a hole.
    /// Returns None iff `cands` is empty.
    pub fn select_most_specific(cands: &[Self]) -> Option<&Self> {
        fn specificity_score<T: Theory>(obj: &TheoryObject<T>) -> usize {
            match obj {
                TheoryObject::Generator(_) => 1,
                TheoryObject::ModalApplication { on, .. } => 1 + specificity_score(on),
                TheoryObject::Hole { .. } => 0,
            }
        }
        cands.iter().max_by_key(|o| specificity_score(o))
    }

    /// Refine the knowledge recorded by `self` with a new observation `by`,
    /// returning the meet of the two. Because a TheoryObject is a linear chain,
    /// two objects can only ever be compatible by one being a prefix-refinement
    /// of the other, so the meet is simply the more specific of the two
    /// whenever they unify, and a failure to unify is a genuine conflict.
    pub fn refine(&self, by: &Self) -> Result<Self, EConstraint> {
        if !T::objects_unify(&[self, by]) {
            return Err(EConstraint::CannotUnify {
                known: self.to_string(),
                with: by.to_string(),
            });
        }
        Ok(Self::select_most_specific(&[self.clone(), by.clone()])
            .expect("two-element slice is non-empty")
            .clone())
    }
}
