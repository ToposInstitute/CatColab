//! ODE analyses of models.

use std::{collections::HashMap, hash::Hash};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify_next::Tsify;

/// Results from an ODE simulation.
#[derive(Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub struct ODEResult<Id>
where
    Id: Eq + Hash,
{
    /// Values of time variable for the duration of the simulation.
    time: Vec<f32>,

    /// Values of state variables for the duration of the simulation.
    states: HashMap<Id, Vec<f32>>,
}

#[allow(non_snake_case)]
pub mod lotka_volterra;
pub mod stock_flow;

pub use lotka_volterra::*;
