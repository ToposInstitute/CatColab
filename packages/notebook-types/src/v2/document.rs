use crate::current::ModelJudgment;
use crate::current::NotebookCell;
use crate::v1;
use crate::v1::AnalysisDocumentContent;

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
    pub fn migrate_from_v1(old: v1::Document) -> Self {
        match old {
            v1::Document::Model(old) => {
                let cell_contents = old
                    .notebook
                    .cell_contents
                    .into_iter()
                    .map(|(id, cell)| {
                        let new_cell = match cell {
                            v1::NotebookCell::RichText { id, content } => {
                                NotebookCell::RichText { id, content }
                            }
                            v1::NotebookCell::Formal { id, content } => NotebookCell::Formal {
                                id,
                                content: match content {
                                    v1::ModelJudgment::Object(d) => ModelJudgment::Object(d),
                                    v1::ModelJudgment::Morphism(d) => ModelJudgment::Morphism(d),
                                    v1::ModelJudgment::Instantiation(d) => {
                                        ModelJudgment::Instantiation(d)
                                    }
                                },
                            },
                            v1::NotebookCell::Stem { id } => NotebookCell::Stem { id },
                        };
                        (id, new_cell)
                    })
                    .collect();

                Document::Model(ModelDocumentContent {
                    name: old.name,
                    theory: old.theory,
                    notebook: Notebook {
                        cell_contents,
                        cell_order: old.notebook.cell_order,
                    },
                    version: "2".to_string(),
                })
            }

            v1::Document::Diagram(old) => Document::Diagram(DiagramDocumentContent {
                name: old.name,
                diagram_in: old.diagram_in,
                notebook: old.notebook,
                version: "2".to_string(),
            }),

            v1::Document::Analysis(old) => Document::Analysis(AnalysisDocumentContent {
                name: old.name,
                analysis_type: old.analysis_type,
                analysis_of: old.analysis_of,
                notebook: old.notebook,
                version: "2".to_string(),
            }),
        }
    }
}
