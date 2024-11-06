//! Wasm bindings for diagrams in models of a double theory.

use uuid::Uuid;

use serde::{Deserialize, Serialize};
use tsify_next::Tsify;
use wasm_bindgen::prelude::*;

use super::model::{Mor, Ob};

/// An object of a diagram in a model of a double theory.
#[derive(Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct DiagramOb {
    /// Indexing object.
    pub ob: Ob,

    /// Object in the model that the indexing object is over.
    pub over: Ob,
}

/// A morphism of a diagram in a model of a double theory.
#[derive(Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct DiagramMor {
    /// Indexing morphism.
    pub mor: Mor,

    /// Morphism that the indexing morphism is over (mapped to).
    pub over: Mor,
}

/// Declares an object of a diagram in a model.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct DiagramObDecl {
    /// Globally unique identifier of object.
    pub id: Uuid,

    /// Object in the model that this object is over, if defined.
    pub over: Option<Ob>,
}

/// Declares a morphism of a diagram in a model.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct DiagramMorDecl {
    /// Globally unique identifier of morphism.
    pub id: Uuid,

    /// Morphism in the model that this morphism is over, if defined.
    pub over: Option<Mor>,

    /// Domain of this morphism, if defined.
    pub dom: Option<Ob>,

    /// Codomain of this morphism, if defined.
    pub cod: Option<Ob>,
}
