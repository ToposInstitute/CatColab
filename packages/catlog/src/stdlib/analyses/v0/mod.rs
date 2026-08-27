//! Version 0 analyses.

#[cfg(feature = "ode")]
pub mod ode;
pub(crate) mod petri;
pub mod reachability;
#[cfg(feature = "sql")]
pub mod sql;
#[cfg(feature = "stochastic")]
pub mod stochastic;
pub(crate) mod stock_flow;
