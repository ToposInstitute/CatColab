//! TODO
//! The theory trait, and zero-sized instances and implementations of various
//! theories.
mod core_types;
mod shared;
pub mod theory;

// Specific theories
mod category;
mod schema;

pub use core_types::*;
pub use shared::HOM;
pub use theory::*;

pub use category::Category;
pub use schema::Schema;
