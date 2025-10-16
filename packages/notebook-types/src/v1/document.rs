use crate::v0;
use crate::v0::AnalysisType;

use super::analysis::Analysis;
use super::api::Link;
use super::notebook::Notebook;

use serde::{Deserialize, Serialize};
use tsify::Tsify;

/// This is the content of a model document. For legacy reasons, we reserve
/// the name "ModelDocument" for `Document & { type: "model" }`.
#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ModelDocumentContent {
    pub name: String,
    pub theory: String,
    pub notebook: Notebook<super::model_judgment::ModelJudgment>,
    pub version: String,
}

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct DiagramDocumentContent {
    pub name: String,
    #[serde(rename = "diagramIn")]
    pub diagram_in: Link,
    pub notebook: Notebook<super::diagram_judgment::DiagramJudgment>,
    pub version: String,
}

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct AnalysisDocumentContent {
    pub name: String,
    #[serde(rename = "analysisType")]
    pub analysis_type: AnalysisType,
    #[serde(rename = "analysisOf")]
    pub analysis_of: Link,
    pub notebook: Notebook<Analysis>,
    pub version: String,
}

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "type")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum Document {
    #[serde(rename = "model")]
    Model(ModelDocumentContent),
    #[serde(rename = "diagram")]
    Diagram(DiagramDocumentContent),
    #[serde(rename = "analysis")]
    Analysis(AnalysisDocumentContent),
}

impl Document {
    pub fn migrate_from_v0(old: v0::Document) -> Self {
        match old {
            v0::Document::Model(old) => Document::Model(ModelDocumentContent {
                name: old.name,
                theory: old.theory,
                notebook: Notebook::migrate_from_v0(old.notebook),
                version: "1".to_string(),
            }),

            v0::Document::Diagram(old) => Document::Diagram(DiagramDocumentContent {
                name: old.name,
                diagram_in: old.diagram_in,
                notebook: Notebook::migrate_from_v0(old.notebook),
                version: "1".to_string(),
            }),

            v0::Document::Analysis(old) => Document::Analysis(AnalysisDocumentContent {
                name: old.name,
                analysis_type: old.analysis_type,
                analysis_of: old.analysis_of,
                notebook: Notebook::migrate_from_v0(old.notebook),
                version: "1".to_string(),
            }),
        }
    }
}
