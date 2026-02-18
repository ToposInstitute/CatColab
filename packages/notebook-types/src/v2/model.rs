use serde::{Deserialize, Serialize};
use tsify::Tsify;

pub use crate::v1::model::*;

/// An equation between two morphisms in a model of a double theory.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct Eqn(pub Mor, pub Mor);
