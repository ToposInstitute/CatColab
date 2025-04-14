use serde::{Deserialize, Serialize};
use tsify::Tsify;
use uuid::Uuid;

use super::model::{Mor, Ob};
use super::theory::{MorType, ObType};

pub type DiagramJudgment = DiagramDecl;

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum DiagramDecl {
    #[serde(rename = "object")]
    ObjectDecl {
        name: String,
        id: Uuid,
        #[serde(rename = "obType")]
        ob_type: ObType,
        over: Option<Ob>,
    },
    #[serde(rename = "morphism")]
    MorphismDecl {
        name: String,
        id: Uuid,
        #[serde(rename = "morType")]
        mor_type: MorType,
        over: Option<Mor>,
        dom: Option<Ob>,
        cod: Option<Ob>,
    },
}
