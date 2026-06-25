//! TODO: doc string

use crate::mtt::theory::{
    Theory, TheoryArrow, TheoryObject, TheoryProArrow, ListModality,
};

/// A trait for extracting and nesting iterated modality applications.
pub trait ModalDepth: Sized + Clone {
    /// Compute the number of iterations of a modality.
    fn modal_depth(&self) -> usize;

    /// Wrap `&self` in a single modal application, failing if there is no
    /// applicable modality.
    fn increment_modal_depth(&self) -> Option<Self>;

    /// Unwrap `&self` if there is an outer modal application, failing
    /// otherwise.
    fn decrement_modal_depth(&self) -> Option<Self>;

    /// Take `&self` to an absolute modal depth, failing if
    /// [increment_modal_depth] or [decrement_modal_depth] would fail in the
    /// default implementation.
    fn re_nest(&self, depth: usize) -> Option<Self> {
        let current = self.modal_depth();
        let mut result = self.clone();
        match depth.cmp(&current) {
            std::cmp::Ordering::Greater => {
                for _ in 0..(depth - current) {
                    result = result.increment_modal_depth()?;
                }
            }
            std::cmp::Ordering::Less => {
                for _ in 0..(current - depth) {
                    result = result.decrement_modal_depth()?;
                }
            }
            std::cmp::Ordering::Equal => {}
        }
        Some(result)
    }
}

// -----------------------------------------------------------------------------
// TheoryObject

impl<T: Theory> ModalDepth for TheoryObject<T> {
    fn modal_depth(&self) -> usize {
        match self {
            TheoryObject::Generator(_) => 0,
            TheoryObject::ModalApplication { on, .. } => 1 + on.modal_depth(),
            TheoryObject::Hole { .. } => 0,
        }
    }

    fn increment_modal_depth(&self) -> Option<Self> {
        if !<T::ListModality as ListModality>::PRESENT {
            return None;
        }
        Some(TheoryObject::ModalApplication { on: Box::new(self.clone()) })
    }

    fn decrement_modal_depth(&self) -> Option<Self> {
        match self {
            TheoryObject::ModalApplication { on, .. } => Some(*on.clone()),
            _ => None,
        }
    }
}

// -----------------------------------------------------------------------------
// TheoryArrow

impl<T: Theory> ModalDepth for TheoryArrow<T> {
    fn modal_depth(&self) -> usize {
        match self {
            TheoryArrow::Generator { .. } | TheoryArrow::ModalStructureMap { .. } => 0,
            TheoryArrow::ModalApplication { on, .. } => 1 + on.modal_depth(),
        }
    }

    fn increment_modal_depth(&self) -> Option<Self> {
        if !<T::ListModality as ListModality>::PRESENT {
            return None;
        }
        Some(TheoryArrow::ModalApplication { on: Box::new(self.clone()) })
    }

    fn decrement_modal_depth(&self) -> Option<Self> {
        match self {
            TheoryArrow::ModalApplication { on, .. } => Some(*on.clone()),
            _ => None,
        }
    }
}

// -----------------------------------------------------------------------------
// TheoryProArrow

impl<T: Theory> ModalDepth for TheoryProArrow<T> {
    fn modal_depth(&self) -> usize {
        match self {
            TheoryProArrow::Hom(object) => object.modal_depth(), // TODO: it's not very clear what should happen here
            TheoryProArrow::Generator { .. } | TheoryProArrow::Hole { .. } => 0, // TODO: It's not very clear what should happen to holes
            TheoryProArrow::ModalApplication { on, .. } => 1 + on.modal_depth(),
            TheoryProArrow::Restriction { base, .. } => base.modal_depth(),
        }
    }

    fn increment_modal_depth(&self) -> Option<Self> {
        if !<T::ListModality as ListModality>::PRESENT {
            return None;
        }
        Some(TheoryProArrow::ModalApplication { on: Box::new(self.clone()) })
    }

    fn decrement_modal_depth(&self) -> Option<Self> {
        match self {
            TheoryProArrow::ModalApplication { on, .. } => Some(*on.clone()),
            _ => None,
        }
    }
}
