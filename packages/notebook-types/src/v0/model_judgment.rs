use serde::{Deserialize, Serialize};
use tsify::{Tsify, declare};
use uuid::Uuid;

use super::model::Ob;
use super::theory::{MorType, ObType};

#[declare]
pub type ModelJudgment = ModelDecl;

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag")]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub enum ModelDecl {
    #[serde(rename = "object")]
    ObjectDecl {
        name: String,
        id: Uuid,
        #[serde(rename = "obType")]
        ob_type: ObType,
    },
    #[serde(rename = "morphism")]
    MorphismDecl {
        name: String,
        id: Uuid,
        #[serde(rename = "morType")]
        mor_type: MorType,
        dom: Option<Ob>,
        cod: Option<Ob>,
    },
}
