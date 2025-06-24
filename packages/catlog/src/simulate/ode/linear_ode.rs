//! Constant-coefficient linear first-order differential equations.

use nalgebra::{DMatrix, DVector};

#[cfg(test)]
use super::ODEProblem;
use super::ODESystem;

/** A (constant-coefficient) linear (first-order) dynamical system.

A system of linear first-order ODEs with constant coefficients; a semantics for
causal loop diagrams.
*/
#[derive(Clone, Debug, PartialEq)]
pub struct LinearODESystem {
    coefficients: DMatrix<f32>,
}

impl LinearODESystem {
    /// Create a new LinearODE system.
    pub fn new(A: DMatrix<f32>) -> Self {
        Self {
            coefficients: A,
        }
    }
}

impl ODESystem for LinearODESystem {
    fn vector_field(&self, dx: &mut DVector<f32>, x: &DVector<f32>, _t: f32) {
        let A = &self.coefficients;
        *dx = A * x
    }
}
