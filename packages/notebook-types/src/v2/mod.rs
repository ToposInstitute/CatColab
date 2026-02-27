use crate::v1;

pub use v1::{analysis, api, cell, path, theory};
pub mod diagram_judgment;
pub mod document;
pub mod model;
pub mod model_judgment;
pub mod notebook;

pub use analysis::*;
pub use api::*;
pub use cell::*;
pub use diagram_judgment::*;
pub use document::*;
pub use model::*;
pub use model_judgment::*;
pub use notebook::*;
pub use path::*;
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
