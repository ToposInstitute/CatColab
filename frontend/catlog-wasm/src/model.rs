//! Wasm bindings for models of double theories.

use uuid::Uuid;

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use tsify_next::{declare, Tsify};

use super::theory::{ObType, MorType};


/// Identifier of object in model of double theory.
#[declare]
pub type ObId = Uuid;

/// Identifier of morphism in model of double theory.
#[declare]
pub type MorId = Uuid;

/// Declaration of object in model of double theory.
#[derive(Eq, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct ObDecl {
    /// Globally unique identifier of object.
    pub id: ObId,

    /// Object type in double theory.
    #[serde(rename="obType")]
    pub ob_type: ObType,
}

/// Declaration of morphism in model of double theory.
#[derive(Eq, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct MorDecl {
    /// Globally unique identifier of morphism.
    pub id: MorId,

    /// Morphism type in double theory.
    #[serde(rename="morType")]
    pub mor_type: MorType,

    /// Domain of morphism, if defined.
    pub dom: Option<ObId>,

    /// Codomain of morphism, if defined.
    pub cod: Option<ObId>,
}
