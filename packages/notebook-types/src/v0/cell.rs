use serde::{Deserialize, Serialize};
use tsify::{Tsify, declare};
use uuid::Uuid;

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum NotebookCell<T> {
    #[serde(rename = "rich-text")]
    RichText { id: Uuid, content: String },
    #[serde(rename = "formal")]
    Formal { id: Uuid, content: T },
    #[serde(rename = "stem")]
    Stem { id: Uuid },
}

#[declare]
pub type Cell<T> = NotebookCell<T>;
