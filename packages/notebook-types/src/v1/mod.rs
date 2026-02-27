use crate::v0;

pub use v0::{analysis, api, cell, diagram_judgment, model, model_judgment, path, theory};

pub mod document;
pub mod notebook;

pub use cell::*;
pub use diagram_judgment::*;
pub use document::*;
pub use model_judgment::*;
pub use notebook::*;

#[cfg(test)]
mod test {
    use super::document::Document;
    use crate::test_utils::test_example_documents;

    #[test]
    fn test_v1_examples() {
        test_example_documents::<Document, _>("examples/v1", |_, _| {});
    }
}
