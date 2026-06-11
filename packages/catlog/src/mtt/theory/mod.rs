//! TODO
//! The theory trait, and zero-sized instances and implementations of various
//! theories.
mod shared;
pub mod theory;

// Specific theories
mod category;
mod schema;

pub use category::Category;
pub use schema::Schema;
pub use theory::*;
