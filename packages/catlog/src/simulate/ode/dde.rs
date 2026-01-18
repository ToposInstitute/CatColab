//! Delay differential equatiosn

use nalgebra::DVector;

#[cfg(test)]
use super::ODEProblem;
use super::ODESystem;

#[derive(Clone, Debug, PartialEq)]
pub struct DelayDifferentialEquation {
    lags: DVector<f32>;
}

impl DDE for DelayDifferentialEquation {
    ///
}

impl ODESystem for DelayDifferentialEquation {
    fn vector_field(&self, dx: &mut DVector<f32>, x: &DVector<f32>, _t: f32) {
        
    }
}
