use crate::v1;

pub use v1::{analysis, api, diagram_judgment, model, model_judgment, path, theory};

pub mod cell;
pub mod document;
pub mod notebook;

pub use analysis::*;
pub use api::*;
pub use cell::*;
pub use diagram_judgment::*;
pub use document::*;
pub use model::*;
pub use model_judgment::*;
pub use notebook::*;
pub use theory::*;

#[cfg(test)]
mod test {
    use super::document::Document;
    use crate::test_utils::test_example_documents;

    #[test]
    fn test_v2_examples() {
        test_example_documents::<Document, _>("examples/v2", |_, _| {});
    }
}

#[cfg(test)]
mod migration_test {
    use super::*;
    use crate::v1;
    use std::collections::HashMap;
    use uuid::Uuid;

    /// Migration drops stem cells from both `cell_contents` and `cell_order`,
    /// while preserving non-stem cells in order.
    #[test]
    fn migrate_drops_stem_cells() {
        let id_text = Uuid::from_u128(1);
        let id_stem = Uuid::from_u128(2);
        let id_text2 = Uuid::from_u128(3);

        let mut cell_contents: HashMap<Uuid, v1::NotebookCell<()>> = HashMap::new();
        cell_contents
            .insert(id_text, v1::NotebookCell::RichText { id: id_text, content: "first".into() });
        cell_contents.insert(id_stem, v1::NotebookCell::Stem { id: id_stem });
        cell_contents.insert(
            id_text2,
            v1::NotebookCell::RichText { id: id_text2, content: "second".into() },
        );

        let old = v1::Notebook {
            cell_contents,
            cell_order: vec![id_text, id_stem, id_text2],
        };

        let new = Notebook::<()>::migrate_from_v1(old);

        assert_eq!(new.cell_order, vec![id_text, id_text2]);
        assert_eq!(new.cell_contents.len(), 2);
        assert!(new.cell_contents.contains_key(&id_text));
        assert!(new.cell_contents.contains_key(&id_text2));
        assert!(!new.cell_contents.contains_key(&id_stem));
    }
}
