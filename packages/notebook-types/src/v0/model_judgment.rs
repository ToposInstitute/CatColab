use serde::{Deserialize, Serialize};
use tsify::Tsify;
use uuid::Uuid;

use super::api::Link;
use super::model::Ob;
use super::theory::{MorType, ObType};

/// Declares an object in a model of a double theory.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct ObDecl {
    /// Human-readable label for object.
    pub name: String,

    /// Globally unique identifier of object.
    pub id: Uuid,

    /// The object's type in the double theory.
    #[serde(rename = "obType")]
    pub ob_type: ObType,
}

/// Declares a morphism in a model of a double theory.
#[derive(Debug, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct MorDecl {
    /// Human-readable label for morphism.
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

/// Instantiates an existing model into the current model.
#[derive(Debug, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct InstantiatedModel {
    /// Human-readable label for the instantiation.
    pub name: String,

    /// Globally unique identifer of the instantiation.
    pub id: Uuid,

    /// Link to the model to instantiate.
    pub model: Option<Link>,

    /// List of specializations to perform on the instantiated model.
    pub specializations: Vec<SpecializeModel>,
}

/// A specialization of a generating object in an instantiated model.
#[derive(Debug, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct SpecializeModel {
    /// ID (qualified name) of generating object to specialize.
    pub id: Option<String>,

    /// Object to insert as the specialization.
    pub ob: Option<Ob>,
}

/// A judgment defining part of a model of a double theory.
#[derive(Debug, PartialEq, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum ModelJudgment {
    /// Declares a generating object of the model.
    #[serde(rename = "object")]
    Object(ObDecl),

    /// Declares a generating morphism of the model.
    #[serde(rename = "morphism")]
    Morphism(MorDecl),

    /// Instantiates an existing model into this model.
    #[serde(rename = "instantiation")]
    Instantiation(InstantiatedModel),
}
