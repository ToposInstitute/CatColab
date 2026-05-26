use crate::v0::AnalysisType;
use crate::v1;
pub use crate::v1::DocumentType;

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
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        rename = "editorVariant"
    )]
    pub editor_variant: Option<String>,
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

#[derive(PartialEq, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "type")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum Document {
    #[serde(rename = "model")]
    Model(ModelDocumentContent),
    #[serde(rename = "diagram")]
    Diagram(DiagramDocumentContent),
    #[serde(rename = "analysis")]
    Analysis(AnalysisDocumentContent),
    // TODO: Re-enable this only after the frontend supports Petri net documents
    // throughout its document routing, menus ... other exhaustive checks over
    // document types.

    // #[serde(rename = "petrinet")]
    // PetriNet(PetriNetDocumentContent),
}

impl Document {
    pub fn migrate_from_v1(old: v1::Document) -> Self {
        match old {
            v1::Document::Model(old) => Document::Model(ModelDocumentContent {
                name: old.name,
                theory: old.theory,
                editor_variant: old.editor_variant,
                notebook: Notebook::migrate_from_v1(old.notebook),
                version: "2".to_string(),
            }),

            v1::Document::Diagram(old) => Document::Diagram(DiagramDocumentContent {
                name: old.name,
                diagram_in: old.diagram_in,
                notebook: Notebook::migrate_from_v1(old.notebook),
                version: "2".to_string(),
            }),

            v1::Document::Analysis(old) => Document::Analysis(AnalysisDocumentContent {
                name: old.name,
                analysis_type: old.analysis_type,
                analysis_of: old.analysis_of,
                notebook: Notebook::migrate_from_v1(old.notebook),
                version: "2".to_string(),
            }),
        }
    }
}
