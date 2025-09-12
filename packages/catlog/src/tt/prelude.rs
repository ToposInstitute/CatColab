/*! Common imports for [crate::tt] */
pub use crate::tt::util::*;
pub use crate::{one::Path, zero::NameSegment};
pub use indexmap::IndexMap;
pub use std::collections::HashMap;
pub use std::rc::Rc;
pub use tattle::{Loc, Reporter};
pub use ustr::{Ustr, ustr};

// TODO: maybe we should also have a "display name" for pretty-printing
// in the NameSegment::Uuid case

/// The type of local variable names
pub type VarName = NameSegment;
/// The type of global variable names
pub type TopVarName = NameSegment;
/// The type of field names in record types
pub type FieldName = NameSegment;

pub(super) fn text_seg(s: impl Into<Ustr>) -> NameSegment {
    NameSegment::Text(s.into())
}
