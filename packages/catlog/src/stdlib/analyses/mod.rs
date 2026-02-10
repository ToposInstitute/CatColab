//! Various analyses that can be performed on models.

#[cfg(feature = "ode")]
pub mod ode;

pub mod reachability;

#[cfg(feature = "sql")]
pub mod sql;
