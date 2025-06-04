//! Constant-coefficient linear (CCL) differential equations.

use nalgebra::{DMatrix, DVector};

#[cfg(test)]
use super::ODEProblem;
use super::ODESystem;

/** A CCL dynamical system.

TO-DO: write this
*/
#[derive(Clone, Debug, PartialEq)]
pub struct CCLSystem {
    interaction_coeffs: DMatrix<f32>,
}

impl CCLSystem {
    /// Create a new CCL system.
    pub fn new(A: DMatrix<f32>) -> Self {
        Self {
            interaction_coeffs: A,
        }
    }
}

impl ODESystem for CCLSystem {
    fn vector_field(&self, dx: &mut DVector<f32>, x: &DVector<f32>, _t: f32) {
        let A = &self.interaction_coeffs;
        *dx = A * x
    }
}
