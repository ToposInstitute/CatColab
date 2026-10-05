//! Version 0 of `lotka_volterra`, before the addition of `ode_semantics`.

use std::collections::HashMap;

use crate::zero::QualifiedName;

/// Data defining a Lotka-Volterra problem for a model.
pub struct LotkaVolterraProblemData {
    /// Map from morphism IDs to interaction coefficients (nonnegative reals).
    pub(crate) interaction_coeffs: HashMap<QualifiedName, f32>,
    /// Map from object IDs to growth rates (arbitrary real numbers).
    pub(crate) growth_rates: HashMap<QualifiedName, f32>,
    /// Map from object IDs to initial values (nonnegative reals).
    pub(crate) initial_values: HashMap<QualifiedName, f32>,
    /// Duration of simulation.
    pub(crate) duration: f32,
}
