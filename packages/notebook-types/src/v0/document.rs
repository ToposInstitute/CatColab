use super::notebook::Notebook;
use super::model_judgment::ModelJudgment;
use super::diagram_judgment::DiagramJudgment;
use super::api::Link;

use serde::{Serialize, Deserialize};
use tsify::Tsify;

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ModelDocument {
    pub name: String,
    pub theory: String,
    pub notebook: Notebook<ModelJudgment>
}

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct DiagramDocument {
    pub name: String,
    #[serde(rename="diagramIn")]
    pub diagram_in: Link,
    pub notebook: Notebook<DiagramJudgment>
}

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "type")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum Document {
    #[serde(rename="model")]
    Model(ModelDocument),
    #[serde(rename="diagram")]
    Diagram(DiagramDocument)
}
