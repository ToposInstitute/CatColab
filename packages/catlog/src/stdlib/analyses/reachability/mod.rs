//! Reachability analyses of models.

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use std::hash::Hash;
use std::collections::HashMap;

/// Data defining a mass-action ODE problem for a model.
#[derive(Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct ReachabilityProblemData<Id>
where
    Id: Eq + Hash,
{
    /// Map from morphism IDs to rate coefficients (nonnegative reals).
    pub tokens: HashMap<Id, i32>,

    /// Map from object IDs to initial values (nonnegative reals).
    pub forbidden: HashMap<Id, i32>,
}
