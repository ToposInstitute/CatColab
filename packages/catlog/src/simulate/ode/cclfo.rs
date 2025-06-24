//! Constant-coefficient linear first-order (CCLFO) differential equations.

use nalgebra::{DMatrix, DVector};

#[cfg(test)]
use super::ODEProblem;
use super::ODESystem;

/** A CCLFO dynamical system.

A system of linear first-order ODEs with constant coefficient; a semantics for
extended causal loop diagrams (ECLDs).
*/
#[derive(Clone, Debug, PartialEq)]
pub struct CCLFOSystem {
    interaction_coeffs: DMatrix<f32>,
}

impl CCLFOSystem {
    /// Create a new CCLFO system.
    pub fn new(A: DMatrix<f32>) -> Self {
        Self {
            interaction_coeffs: A,
        }
    }
}

impl ODESystem for CCLFOSystem {
    fn vector_field(&self, dx: &mut DVector<f32>, x: &DVector<f32>, _t: f32) {
        let A = &self.interaction_coeffs;
        *dx = A * x
    }
}
