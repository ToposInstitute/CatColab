use super::model::Mor;
use serde::{Deserialize, Serialize};
use tsify::Tsify;
use uuid::Uuid;

pub use crate::v1::model_judgment::{InstantiatedModel, MorDecl, ObDecl, SpecializeModel};

/// Declares an object in a model of a double theory.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct EqnDecl {
    /// Human-readable label for equation.
    pub name: String,

    /// Globally unique identifier of equation.
    pub id: Uuid,

    /// The left-hand side of the equation, if defined.
    pub lhs: Option<Mor>,

    /// The right-hand side of the equation, if defined.
    pub rhs: Option<Mor>,
}

/// A judgment defining part of a model of a double theory.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum ModelJudgment {
    /// Declares a generating object of the model.
    #[serde(rename = "object")]
    Object(ObDecl),

    /// Declares a generating morphism of the model.
    #[serde(rename = "morphism")]
    Morphism(MorDecl),

    /// Declares an equation between two morphisms in the model.
    #[serde(rename = "equation")]
    Equation(EqnDecl),

    /// Instantiates an existing model into this model.
    #[serde(rename = "instantiation")]
    Instantiation(InstantiatedModel),
}
