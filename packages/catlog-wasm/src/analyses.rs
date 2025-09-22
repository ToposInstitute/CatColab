//! Auxiliary structs for data passed to/from analyses.

use serde::{Deserialize, Serialize};
use tsify::Tsify;

use wasm_bindgen::prelude::*;

use super::result::JsResult;
use catlog::stdlib::analyses;
use super::{model::DblModel};

/// The result of an ODE analysis, containing the solution when successful.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ODEResult(pub JsResult<analyses::ode::ODESolution, String>);

/// A wrapper type to enable multiple simulations to be run on the same
/// StochasticMassActionAnalysis
#[wasm_bindgen]
pub struct StochasticWrapper(analyses::ode::StochasticMassActionAnalysis);

#[wasm_bindgen]
impl StochasticWrapper {
    /// Creates an internal instance of StochasticMassActionAnalysis using the given model and
    /// data
    #[wasm_bindgen(constructor)]
    pub fn new(
        model: &DblModel,
        data: analyses::ode::MassActionProblemData,
        seed: u64,
    ) -> Result<Self, String> {
        Ok(Self(
            analyses::ode::PetriNetMassActionAnalysis::default()
                .build_stochastic_system(model.modal()?, data, Some(seed))
        ))
    }

    /// Calls simulate on the internal StochasticMassActionAnalysis instance
    #[wasm_bindgen]
    pub fn simulate(&mut self) -> Result<ODEResult, String> {
        Ok(ODEResult(JsResult::Ok(self.0.simulate())))
    }
}
