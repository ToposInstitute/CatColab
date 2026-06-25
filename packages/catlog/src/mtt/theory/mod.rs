//! TODO
//! The theory trait, and zero-sized instances and implementations of various
//! theories.
mod cell_search;
mod core_types;
mod list_modality;
mod modal_depth;
pub mod theory;
mod trait_impls;
mod unify_arrows;
mod unify_objects;
mod unify_pro_arrows;

// Specific theories
mod category;
mod multicategory;
mod schema;

pub use core_types::*;
pub use list_modality::ListModality;
pub use theory::*;

pub use category::Category;
pub use multicategory::Multicategory;
pub use schema::Schema;
