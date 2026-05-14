use crate::mtt::{
    checker::{
        TheoryObject, TheoryObjectConstraint,
        error::EConstraint,
        hole::{HoleState, Holy},
    },
    theory::Theory,
};

/// A wrapper for constraint interactions, intended to be implemented and used
/// on Constraint<C> for various concrete `C`.
pub trait Constraint<Con: Clone>: Sized {
    /// Extend self by the value `by`. This subsumes the logic of consistency
    /// checking and normalisation.
    fn extend(&self, by: &Con) -> Result<Self, EConstraint>;

    /// Compute the most specific constraint that we have, if there is one at
    /// all.
    fn most_specific(&self) -> Option<&Con>;
}

impl<T: Theory> Constraint<TheoryObject<T>> for TheoryObjectConstraint<T> {
    fn extend(&self, by: &TheoryObject<T>) -> Result<Self, EConstraint> {
        match self {
            HoleState::Closed(soln) => {
                if !T::objects_unify(&[soln, by]) {
                    Err(EConstraint::CannotUnify {
                        known: vec![soln.to_string()],
                        with: by.to_string(),
                    })
                } else {
                    Ok(self.clone())
                }
            }
            HoleState::Open(known) => {
                let all = known.iter().chain([by]).collect::<Vec<_>>();
                if !T::objects_unify(&all) {
                    return Err(EConstraint::CannotUnify {
                        known: all.iter().map(|c| c.to_string()).collect(),
                        with: by.to_string(),
                    });
                }
                if by.is_concrete() {
                    Ok(TheoryObjectConstraint::Closed(by.clone()))
                } else {
                    let mut known = known.clone();
                    known.push(by.clone());
                    Ok(TheoryObjectConstraint::Open(known))
                }
            }
        }
    }

    fn most_specific(&self) -> Option<&TheoryObject<T>> {
        match self {
            HoleState::Closed(soln) => Some(soln),
            HoleState::Open(known) => TheoryObject::select_most_specific(known),
        }
    }
}
