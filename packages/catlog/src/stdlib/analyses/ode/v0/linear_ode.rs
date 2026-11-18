//! Version 0 of `linear_ode`, before the addition of `ode_semantics`.

use std::collections::HashMap;

use crate::zero::QualifiedName;

/// Data defining a linear ODE problem for a model.
pub struct LinearODEProblemData {
    /// Map from morphism IDs to interaction coefficients (nonnegative reals).
    pub(crate) coefficients: HashMap<QualifiedName, f32>,
    /// Map from object IDs to initial values (nonnegative reals).
    pub(crate) initial_values: HashMap<QualifiedName, f32>,
    /// Duration of simulation.
    pub(crate) duration: f32,
}
