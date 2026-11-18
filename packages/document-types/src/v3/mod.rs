use crate::v2;

pub use v2::{
    api, diagram_judgment, llm_conversation, model, model_judgment, path, rich_text, theory,
};

/// Analyses.
pub mod analysis;
/// Cells in a notebook.
pub mod cell;
/// Model documents, containing a notebook along with metadata.
pub mod document;
/// Notebooks for models and diagrams.
pub mod notebook;

pub use analysis::*;
pub use api::*;
pub use cell::*;
pub use diagram_judgment::*;
pub use document::*;
pub use llm_conversation::*;
pub use model::*;
pub use model_judgment::*;
pub use notebook::*;
pub use rich_text::*;
pub use theory::*;

#[cfg(test)]
mod test {
    use super::document::Document;
    use crate::test_utils::test_example_documents;

    #[test]
    fn test_v3_examples() {
        test_example_documents::<Document, _>("examples/v3", |_, _| {});
    }
}

#[cfg(test)]
mod migration_test {
    use super::*;
    use crate::v2;
    use serde_json::{Map, Number, Value};
    use std::collections::HashMap;
    use uuid::Uuid;

    /// Migration adds version numbers to individual analyses.
    #[test]
    fn migrate_adds_version_numbers_to_analyses() {
        let id_text = Uuid::from_u128(1);

        let mut analysis_content = HashMap::new();
        analysis_content.insert("coefficients".to_string(), Value::Object(Map::new()));
        analysis_content.insert("intialValues".to_string(), Value::Object(Map::new()));
        analysis_content.insert(
            "duration".to_string(),
            Value::Number(Number::from_f64(10.0).expect("Simple cast of 10.0 to 10f64")),
        );

        let old_analysis = v2::Analysis {
            id: "linear-ode".to_string(),
            content: analysis_content.clone(),
        };
        let new_analysis = Analysis {
            id: "linear-ode".to_string(),
            content: analysis_content,
            version: "0".to_string(),
        };

        let mut old_cell_contents: HashMap<Uuid, v2::NotebookCell<v2::Analysis>> = HashMap::new();
        old_cell_contents.insert(
            id_text,
            v2::NotebookCell::<v2::Analysis>::Formal { id: id_text, content: old_analysis },
        );

        let new_cell = NotebookCell::<Analysis>::Formal { id: id_text, content: new_analysis };

        let old_notebook = v2::Notebook::<v2::Analysis> {
            cell_contents: old_cell_contents,
            cell_order: vec![id_text],
        };
        let migrated_notebook = Notebook::<Analysis>::migrate_from_v2_with_generic(
            old_notebook,
            Analysis::migrate_from_v2,
        );

        assert!(migrated_notebook.cell_contents.contains_key(&id_text));
        assert_eq!(migrated_notebook.cell_contents.get(&id_text).unwrap(), &new_cell);
    }
}
