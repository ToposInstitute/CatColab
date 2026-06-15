//! TODO
//! The theory trait, and zero-sized instances and implementations of various
//! theories.
mod core_types;
mod list;
mod shared;
pub mod theory;
mod trait_impls;

// Specific theories
mod category;
mod multicategory;
mod schema;

pub use core_types::*;
pub use list::ListVariant;
pub use theory::*;

pub use category::Category;
pub use multicategory::Multicategory;
pub use schema::Schema;
