//! Rust-TypeScript interop for categorical logic.
//!
//! This crate provides [WebAssembly](https://webassembly.org/) (Wasm) bindings for
//! the [`catlog`] crate using Rust's `wasm-bindgen`. The aim is to keep the logic
//! here as simple as possible, with [`catlog`] doing all the real work. However,
//! the translation is nontrivial because there is a single, catch-all type
//! definition for a double theory in TypeScript, but several kinds of double
//! theories implemented in Rust (discrete theories, modal theories, and so on). The
//! same is true for other structures, such as models of theories and diagrams in
//! models.

#![warn(missing_docs)]

pub mod notation;
pub mod result;

pub mod model;
pub mod model_diagram;
pub mod model_diagram_presentation;
pub mod model_morphism;
pub mod model_presentation;
pub mod theory;

pub mod analyses;
#[allow(clippy::new_without_default)]
#[allow(missing_docs)]
pub mod theories;

use wasm_bindgen::prelude::*;

/// Set panic hook to get better error messages on panics.
///
/// When the `console_error_panic_hook` feature is enabled, we can call the
/// `set_panic_hook` function at least once during initialization, and then we will
/// get better error messages if our code ever panics.
///
/// For more details see <https://github.com/rustwasm/console_error_panic_hook#readme>
#[wasm_bindgen]
pub fn set_panic_hook() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}
