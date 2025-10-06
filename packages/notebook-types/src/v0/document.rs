use super::analysis::Analysis;
use super::api::Link;
use super::diagram_judgment::DiagramJudgment;
use super::model_judgment::ModelJudgment;
use super::notebook::Notebook;

use serde::{Deserialize, Serialize};
use tsify::Tsify;

/// The content of a model document. For legacy reasons, we reserve the name
/// `ModelDocument` for the type `Document & { type: "model" }`.
#[derive(PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct ModelDocumentContent {
    pub name: String,
    pub theory: String,
    pub notebook: Notebook<ModelJudgment>,
}

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct DiagramDocumentContent {
    pub name: String,
    #[serde(rename = "diagramIn")]
    pub diagram_in: Link,
    pub notebook: Notebook<DiagramJudgment>,
}

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum AnalysisType {
    #[serde(rename = "model")]
    Model,
    #[serde(rename = "diagram")]
    Diagram,
}

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct AnalysisDocumentContent {
    pub name: String,
    #[serde(rename = "analysisType")]
    pub analysis_type: AnalysisType,
    #[serde(rename = "analysisOf")]
    pub analysis_of: Link,
    pub notebook: Notebook<Analysis>,
}

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Document {
    #[serde(rename = "model")]
    Model(ModelDocumentContent),
    #[serde(rename = "diagram")]
    Diagram(DiagramDocumentContent),
    #[serde(rename = "analysis")]
    Analysis(AnalysisDocumentContent),
}
