mod v0;

pub mod current {
    // this should always track the latest version, and is the only version
    // that is exported from notebook-types
    pub use crate::v0::*;
}
