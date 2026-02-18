use serde::{Deserialize, Serialize};
use tsify::Tsify;
use uuid::Uuid;

use super::model::Mor;
pub use crate::v1::diagram_judgment::{DiagramMorDecl, DiagramObDecl};

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
