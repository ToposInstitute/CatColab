//! Version 0 of `mass_action`, before the addition of `ode_semantics`.

use std::collections::HashMap;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use crate::{stdlib::analyses::ode::MassConservationType, zero::QualifiedName};

/// Data defining mass-action ODE equations for a model.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
#[derive(Clone)]
pub struct MassActionEquationsData {
    /// Whether or not mass is conserved.
    #[cfg_attr(feature = "serde", serde(rename = "massConservationType"))]
    pub mass_conservation_type: MassConservationType,
}

/// Data defining a mass-action problem for a model.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct MassActionProblemData {
    /// Data used for generating the equations (namely, whether or not mass is conserved).
    #[cfg_attr(feature = "serde", serde(rename = "equationsData"))]
    pub(crate) equations_data: MassActionEquationsData,

    /// Map from morphism IDs to consumption rate coefficients (non-negative reals),
    /// for the balanced per transition case.
    /// N.B. This is renamed to "rates" in catlog-wasm for backwards compatibility.
    #[cfg_attr(feature = "serde", serde(rename = "rates"))]
    pub(crate) transition_rates: HashMap<QualifiedName, f32>,

    /// Map from morphism IDs to consumption rate coefficients (non-negative reals),
    /// for the unbalanced per transition case.
    #[cfg_attr(feature = "serde", serde(rename = "transitionConsumptionRates"))]
    pub(crate) transition_consumption_rates: HashMap<QualifiedName, f32>,

    /// Map from morphism IDs to production rate coefficients (non-negative reals),
    /// for the unbalanced per transition case.
    #[cfg_attr(feature = "serde", serde(rename = "transitionProductionRates"))]
    pub(crate) transition_production_rates: HashMap<QualifiedName, f32>,

    /// Map from morphism IDs to (map from input objects to consumption rate coefficients),
    /// for the unbalanced per place case (non-negative reals).
    #[cfg_attr(feature = "serde", serde(rename = "placeConsumptionRates"))]
    pub(crate) place_consumption_rates: HashMap<QualifiedName, HashMap<QualifiedName, f32>>,

    /// Map from morphism IDs to (map from output objects to production rate coefficients),
    /// for the unbalanced per place case (non-negative reals).
    #[cfg_attr(feature = "serde", serde(rename = "placeProductionRates"))]
    pub(crate) place_production_rates: HashMap<QualifiedName, HashMap<QualifiedName, f32>>,

    /// Map from object IDs to initial values (non-negative reals).
    #[cfg_attr(feature = "serde", serde(rename = "initialValues"))]
    pub(crate) initial_values: HashMap<QualifiedName, f32>,

    /// Duration of simulation.
    pub(crate) duration: f32,
}
