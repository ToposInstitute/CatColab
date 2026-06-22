use super::analysis::Analysis;
use super::api::Link;
use super::diagram_judgment::DiagramJudgment;
use super::model_judgment::ModelJudgment;
use super::notebook::Notebook;

use std::str::FromStr;

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

/// The type/kind of a document, without any associated content.
#[derive(PartialEq, Eq, Debug, Clone, Copy, Serialize, Deserialize, Tsify)]
#[cfg_attr(
    feature = "backend",
    derive(autosurgeon::Reconcile, autosurgeon::Hydrate, ts_rs::TS)
)]
#[cfg_attr(
    feature = "backend",
    ts(export_to = "user_state.ts", rename_all = "lowercase")
)]
#[serde(rename_all = "lowercase")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum DocumentType {
    #[cfg_attr(feature = "backend", autosurgeon(rename = "model"))]
    Model,
    #[cfg_attr(feature = "backend", autosurgeon(rename = "diagram"))]
    Diagram,
    #[cfg_attr(feature = "backend", autosurgeon(rename = "analysis"))]
    Analysis,
}

impl FromStr for DocumentType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "model" => Ok(DocumentType::Model),
            "diagram" => Ok(DocumentType::Diagram),
            "analysis" => Ok(DocumentType::Analysis),
            other => Err(format!("unknown document type: {other}")),
        }
    }
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
