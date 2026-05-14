use crate::mtt::{checker::TheoryObject, theory::Theory};

/// A container type used to track knowledge about holes during checking and
/// inference. A constraint is considered either "open" or "solved".
pub enum HoleState<C> {
    /// The conjuction of all of the individual C.
    Open(Vec<C>),
    /// The known quantity S.
    Closed(C),
}

impl<C: Clone> Clone for HoleState<C> {
    fn clone(&self) -> Self {
        match self {
            HoleState::Open(vec) => HoleState::Open(vec.clone()),
            HoleState::Closed(soln) => HoleState::Closed(soln.clone()),
        }
    }
}

impl<C: std::fmt::Display> std::fmt::Display for HoleState<C> {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> Result<(), std::fmt::Error> {
        match self {
            HoleState::Open(vec) => {
                write!(f, "⦅{}⦆", vec.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(" ∧ "))
            }
            HoleState::Closed(soln) => write!(f, "〚={soln}〛"),
        }
    }
}

/// Operations of interests on inductive types which carry a "hole" variant.
pub trait Holy: Sized {
    /// Determine whether a given term is concrete, that is, does not have any
    /// holes.
    fn is_concrete(&self) -> bool;

    /// Among a variety of candidates with holes, attempt to select the
    /// individual term which is the most specific.
    fn select_most_specific_non_empty<'a>(first: &'a Self, rest: &'a [Self]) -> &'a Self;

    /// The contract for this function is that None is returned iff cands is empty.
    fn select_most_specific(cands: &[Self]) -> Option<&Self> {
        match cands.split_first() {
            Some((first, rest)) => Some(Self::select_most_specific_non_empty(first, rest)),
            None => None,
        }
    }
}

impl<T: Theory> Holy for TheoryObject<T> {
    fn is_concrete(&self) -> bool {
        match self {
            TheoryObject::Generator(_) => true,
            TheoryObject::ModalApplication { on, .. } => on.is_concrete(),
            TheoryObject::Hole { .. } => false,
        }
    }

    fn select_most_specific_non_empty<'a>(first: &'a Self, rest: &'a [Self]) -> &'a Self {
        fn specificity_score<T: Theory>(obj: &TheoryObject<T>) -> usize {
            match obj {
                TheoryObject::Generator(_) => 1,
                TheoryObject::ModalApplication { on, .. } => 1 + specificity_score(on),
                TheoryObject::Hole { .. } => 0,
            }
        }
        let mut best = (specificity_score(first), first);
        if best.0 == 0 {
            return first;
        }
        for to in rest.iter() {
            let s = specificity_score(to);
            if s == 0 {
                return to;
            }
            if best.0 < s {
                best = (s, to);
            }
        }
        best.1
    }
}
