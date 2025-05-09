//! The data structure for storing the parameters of analyses

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tsify::Tsify;
use wasm_bindgen::prelude::*;

use super::name::QualifiedName;

/// A wrapper around `HashMap<QualifiedName, f32>` with methods
/// that are callable from JavaScript. Used to work around the fact
/// that JavaScript can't have maps with complex keys.
///
/// We expose the underlying HashMap to Rust so that we don't have
/// to re-expose so many methods on HashMap; we only have to re-expose
/// methods which will be called from JavaScript.
#[derive(Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct ParameterMap(pub HashMap<String, f32>);

impl ParameterMap {
    /// A wrapper around HashMap::get.
    pub fn get(&self, name: &QualifiedName) -> Option<f32> {
        self.0.get(&name.stable_name()).copied()
    }

    /// A wrapper around HashMap::insert
    pub fn insert(&mut self, name: &QualifiedName, value: f32) {
        self.0.insert(name.stable_name(), value);
    }
}
