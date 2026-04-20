//! Various analyses that can be performed on models.

pub(crate) mod petri;

#[cfg(feature = "ode")]
pub mod ode;

pub mod reachability;

#[cfg(feature = "sql")]
pub mod sql;

#[cfg(feature = "stochastic")]
pub mod stochastic;
