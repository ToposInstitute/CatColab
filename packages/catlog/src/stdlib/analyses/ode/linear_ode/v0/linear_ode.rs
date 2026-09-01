#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use std::collections::HashMap;

use crate::zero::QualifiedName;

/// Data defining a linear ODE problem for a model.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct LinearODEProblemData {
    /// Map from morphism IDs to interaction coefficients (nonnegative reals).
    pub(crate) coefficients: HashMap<QualifiedName, f32>,
    /// Map from object IDs to initial values (nonnegative reals).
    pub(crate) initial_values: HashMap<QualifiedName, f32>,
    /// Duration of simulation.
    pub(crate) duration: f32,
}
