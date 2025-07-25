pub mod analysis;
pub mod api;
pub mod cell;
pub mod diagram_judgment;
pub mod document;
pub mod model;
pub mod model_judgment;
pub mod notebook;
pub mod path;
pub mod theory;

pub use cell::*;
pub use document::*;
pub use notebook::*;

#[cfg(test)]
mod test {
    use super::document::Document;
    use crate::test_utils::test_example_documents;

    #[test]
    fn test_v0_examples() {
        test_example_documents::<Document, _>("examples/v0", |_, _| {});
    }
}
