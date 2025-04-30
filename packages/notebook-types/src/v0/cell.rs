use uuid::Uuid;
use serde::{Serialize, Deserialize};
use tsify::Tsify;

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum Cell<T> {
    #[serde(rename="rich-text")]
    RichText {
        id: Uuid,
        content: String
    },
    #[serde(rename="formal")]
    Formal {
        id: Uuid,
        content: T
    },
    #[serde(rename="stem")]
    Stem {
        id: Uuid
    }
}
