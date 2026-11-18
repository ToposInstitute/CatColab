//! All MTT functionality relating to theories, their implementations, and the
//! data-types dealt with therein.
pub mod cell_search;
pub mod core_types;
mod list_modality;
pub mod modal_depth;
mod trait_impls;
pub mod traits;
pub mod unify_arrows;
pub mod unify_objects;
pub mod unify_pro_arrows;

// Specific theories
mod category;
mod multicategory;
mod schema;

pub use core_types::*;
pub use list_modality::{
    CartesianListModality, ListModality, NoListModality, SymmetricListModality,
};
pub use traits::*;

pub use category::Category;
pub use multicategory::{CartesianMulticategory, Multicategory, SymmetricMulticategory};
pub use schema::Schema;
