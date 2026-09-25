//! The MTT checker, which checks and computes derivations given raw AST data.
mod context;
mod core_types;
mod elaborate;
mod error;
mod model;
mod pro_term;
mod programme;
mod scope;
mod trait_impls;
mod unify_object_types;

pub use context::ProgrammeContext;
pub use core_types::*;
pub use error::*;
pub use programme::*;
