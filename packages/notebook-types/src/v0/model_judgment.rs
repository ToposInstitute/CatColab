use serde::{Deserialize, Serialize};
use tsify::Tsify;
use uuid::Uuid;

use super::model::Ob;
use super::theory::{MorType, ObType};

/// Declares an object in a model of a double theory.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct ObDecl {
    /// Human-readable name of object.
    pub name: String,

    /// Globally unique identifier of object.
    pub id: Uuid,

    /// The object's type in the double theory.
    #[serde(rename = "obType")]
    pub ob_type: ObType,
}

/// Declares a morphism in a model of a double theory.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct MorDecl {
    /// Human-readable name of morphism.
    pub name: String,

    /// Globally unique identifier of morphism.
    pub id: Uuid,

    /// The morphism's type in the double theory.
    #[serde(rename = "morType")]
    pub mor_type: MorType,

    /// Domain of morphism, if defined.
    pub dom: Option<Ob>,

    /// Codomain of morphism, if defined.
    pub cod: Option<Ob>,
}

// For now, we are just going to edit the schema for v0 notebooks
// Eventually, we will revert all of these changes and move to
// v1 notebooks.

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct InstanceDecl {
    pub name: String,

    pub id: Uuid,

    pub notebook_id: String,
}

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum ModelJudgment {
    #[serde(rename = "object")]
    Object(ObDecl),
    #[serde(rename = "morphism")]
    Morphism(MorDecl),
    #[serde(rename = "instance")]
    Instance(InstanceDecl),
}
