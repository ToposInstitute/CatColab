use super::notebook::Notebook;
use super::model_judgment::ModelJudgment;
use super::diagram_judgment::DiagramJudgment;
use super::api::Link;

use serde::{Serialize, Deserialize};
use tsify::Tsify;

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "type")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum Document {
    #[serde(rename="model")]
    Model {
        name: String,
        theory: String,
        notebook: Notebook<ModelJudgment>
    },
    #[serde(rename="diagram")]
    Diagram {
        name: String,
        #[serde(rename="diagramIn")]
        diagram_in: Link,
        notebook: Notebook<DiagramJudgment>
    }
}
