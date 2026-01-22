//! Auxiliary structs for data passed to/from analyses.

use serde::{Deserialize, Serialize};
use tsify::Tsify;

use super::result::JsResult;
use catlog::stdlib::analyses;

/// The result of an ODE analysis, containing the solution when successful.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ODEResult(pub JsResult<analyses::ode::ODESolution, String>);

/// The result of an ODE analysis including equations in LaTex with subsititutions
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ODEResultWithEquations {
    /// The result of the simulation
    pub solution: JsResult<analyses::ode::ODESolution, String>,
    /// The equations in LaTeX format with parameters substituted
    #[serde(rename = "latexEquations")]
    pub latex_equations: Vec<Vec<String>>,
}

/// Symbolic equations in LaTeX format.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ODELatex(pub Vec<Vec<String>>);
