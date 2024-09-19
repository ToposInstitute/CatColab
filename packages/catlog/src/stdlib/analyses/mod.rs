//! A collection of various analysis that one can perform on models.

#[cfg(feature = "ode")]
pub mod lotka_volterra;

#[cfg(feature = "ode")]
pub mod stock_flow;
