//! Storage adapters for Automerge.

mod postgres;
#[allow(missing_docs)]
pub mod testing;

pub use postgres::PostgresStorage;
