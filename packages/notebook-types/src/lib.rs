pub mod v0;
pub mod v1;

#[allow(dead_code)]
pub mod current {
    use super::v0;
    use super::v1;

    enum AnyDocument {
        V0(v0::document::Document),
        V1(v1::document::Document),
    }

    impl AnyDocument {
        pub fn into_current(self) -> v1::document::Document {
            match self {
                AnyDocument::V0(v0) => v0.into(),
                AnyDocument::V1(v1) => v1,
            }
        }
    }
    // this should always track the latest version, and is the only version
    // that is exported from notebook-types
    pub use crate::v0::*;
}
