//! TODO: doc string

use crate::mtt::{
    composite::Composite,
    theory::{Boundary, Theory, TheoryProArrow},
};

/// TODO: doc string
pub fn default_cell_search<T: Theory>(
    top: &Composite<TheoryProArrow<T>>,
    bottom: &Composite<TheoryProArrow<T>>,
) -> Option<Boundary<T>> {
    let _ = (top, bottom);
    todo!("implement this")
}
