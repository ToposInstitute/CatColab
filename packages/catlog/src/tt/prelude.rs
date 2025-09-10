use std::ops::Index;

pub use crate::tt::util::*;
use crate::zero::NameSegment;
pub use std::collections::HashMap;
pub use std::rc::Rc;
pub use tattle::{Loc, Reporter};
pub use ustr::{Ustr, ustr};
pub use uuid::Uuid;

pub type VarName = NameSegment;
pub type TopVarName = NameSegment;
pub type FieldName = NameSegment;
