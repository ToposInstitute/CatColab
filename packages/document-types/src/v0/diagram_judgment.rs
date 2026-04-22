use serde::{Deserialize, Serialize};
use tsify::Tsify;
use uuid::Uuid;

use super::model::{Mor, Ob};
use super::theory::{MorType, ObType};

/// Declares an object of a diagram in a model.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct DiagramObDecl {
    /// Human-readable label for object.
    pub name: String,

    /// Globally unique identifier of object.
    pub id: Uuid,

    /// The object's type in the double theory.
    #[serde(rename = "obType")]
    pub ob_type: ObType,

    /// Object in the model that this object is over, if defined.
    pub over: Option<Ob>,
}

/// Declares a morphism of a diagram in a model.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct DiagramMorDecl {
    /// Human-readable label for morphism.
    pub name: String,

    /// Globally unique identifier of morphism.
    pub id: Uuid,

    /// The morphism's type in the double theory.
    #[serde(rename = "morType")]
    pub mor_type: MorType,

    /// Morphism in the model that this morphism is over, if defined.
    pub over: Option<Mor>,

    /// Domain of this morphism, if defined.
    pub dom: Option<Ob>,

    /// Codomain of this morphism, if defined.
    pub cod: Option<Ob>,
}

/// Declares an equation in a diagram in a model of a double theory.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct DiagramEqnDecl {
    /// Human-readable label for equation.
    pub name: String,

    /// Globally unique identifier of equation.
    pub id: Uuid,

    /// The left-hand side of the equation, if defined.
    pub lhs: Option<Mor>,

    /// The right-hand side of the equation, if defined.
    pub rhs: Option<Mor>,
}

/// A judgment defining part of a diagram in a model.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum DiagramJudgment {
    /// Declares a generating object in the diagram.
    #[serde(rename = "object")]
    Object(DiagramObDecl),

    /// Declares a generating morphism in the diagram.
    #[serde(rename = "morphism")]
    Morphism(DiagramMorDecl),

    /// Declares an equation between morphisms in the diagram.
    #[serde(rename = "equation")]
    Equation(DiagramEqnDecl),
}
