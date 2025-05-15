use serde::{Deserialize, Serialize};
use tsify::Tsify;
use uuid::Uuid;

use super::model::Ob;
use super::theory::{MorType, ObType};

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct ObDecl {
    pub name: String,
    pub id: Uuid,
    #[serde(rename = "obType")]
    pub ob_type: ObType,
}

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct MorDecl {
    pub name: String,
    pub id: Uuid,
    #[serde(rename = "morType")]
    pub mor_type: MorType,
    pub dom: Option<Ob>,
    pub cod: Option<Ob>,
}

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum ModelJudgment {
    #[serde(rename = "object")]
    Object(ObDecl),
    #[serde(rename = "morphism")]
    Morphism(MorDecl),
}
