use uuid::Uuid;
use serde::{Serialize, Deserialize};
use tsify::Tsify;

use super::theory::{ObType, MorType};
use super::model::Ob;


pub type ModelJudgment = ModelDecl;

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum ModelDecl {
    #[serde(rename="object")]
    ObjectDecl {
        name: String,
        id: Uuid,
        #[serde(rename="obType")]
        ob_type: ObType
    },
    #[serde(rename="morphism")]
    MorphismDecl {
        name: String,
        id: Uuid,
        #[serde(rename="morType")]
        mor_type: MorType,
        dom: Option<Ob>,
        cod: Option<Ob>
    }
}
