//! Various analyses that can be performed on models.

// Analyses
#[cfg(feature = "ode")]
pub mod ode;

#[cfg(feature = "reachability")]
pub mod reachability;
#[cfg(feature = "reachability")]
pub use reachability::current::*;

#[cfg(feature = "sql")]
pub mod sql;
#[cfg(feature = "sql")]
pub use sql::current::*;

#[cfg(feature = "stochastic")]
pub mod stochastic;

// Helper crates
pub(crate) mod petri;
