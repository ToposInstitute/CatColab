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

pub mod notation;
pub mod result;

pub mod model;
pub mod model_diagram;
pub mod model_diagram_presentation;
pub mod model_morphism;
pub mod model_presentation;
pub mod theory;
pub mod wd;

pub mod analyses;
#[allow(clippy::new_without_default)]
#[allow(missing_docs)]
pub mod theories;

use tsify::Tsify;
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

/// Validates that analysis content can be deserialized into the correct Rust type.
///
/// This function tests the same deserialization path used by analysis functions,
/// but without requiring a model. It's useful for testing backward compatibility
/// of analysis content from older documents.
///
/// Returns `Ok(())` if the content deserializes successfully, or an error message
/// describing what went wrong.
#[wasm_bindgen(js_name = "validateAnalysisContent")]
pub fn validate_analysis_content(analysis_id: &str, content: JsValue) -> Result<(), String> {
    match analysis_id {
        // Rust-validated analysis types (have a Rust struct with serde deserialization)
        "mass-action" => {
            catlog::stdlib::analyses::ode::MassActionProblemData::from_js(content)
                .map_err(|e| format!("mass-action: {e}"))?;
        }
        "kuramoto" => {
            catlog::stdlib::analyses::ode::KuramotoProblemData::from_js(content)
                .map_err(|e| format!("kuramoto: {e}"))?;
        }
        "lotka-volterra" => {
            catlog::stdlib::analyses::ode::LotkaVolterraProblemData::from_js(content)
                .map_err(|e| format!("lotka-volterra: {e}"))?;
        }
        "linear-ode" => {
            catlog::stdlib::analyses::ode::LinearODEProblemData::from_js(content)
                .map_err(|e| format!("linear-ode: {e}"))?;
        }
        "stochastic-mass-action" => {
            catlog::stdlib::analyses::stochastic::StochasticMassActionProblemData::from_js(content)
                .map_err(|e| format!("stochastic-mass-action: {e}"))?;
        }
        "subreachability" => {
            catlog::stdlib::analyses::reachability::ReachabilityProblemData::from_js(content)
                .map_err(|e| format!("subreachability: {e}"))?;
        }

        // Frontend-only analysis types (no Rust struct, content is valid by definition)
        "decapodes"
        | "diagram"
        | "tabularview"
        | "graph"
        | "erd"
        | "mass-action-equations"
        | "unbalanced-mass-action-equations"
        | "negative-loops"
        | "positive-loops"
        | "delayed-negative-loops"
        | "delayed-positive-loops"
        | "sql" => {
            // No validation needed for frontend-only types
        }

        // Unknown analysis type — fail the test so new types must be added here
        unknown => {
            return Err(format!("unknown analysis type: {unknown}"));
        }
    }

    Ok(())
}
