//! Auxiliary structs for data passed to/from analyses.

use serde::{Deserialize, Serialize};
use tsify::Tsify;
use uuid::Uuid;

use super::result::JsResult;
use catlog::stdlib::analyses;

/// The result of an ODE analysis, containing the solution when successful.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ODEResult(pub JsResult<analyses::ode::ODESolution<Uuid>, String>);

/// Input data for a Lokta-Volterra analysis of a model.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct LotkaVolterraModelData(pub analyses::ode::LotkaVolterraProblemData<Uuid>);

/// Input data for a linear ODE analysis of a model.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct LinearODEModelData(pub analyses::ode::LinearODEProblemData<Uuid>);

/// Input data for a mass-action dynamics analysis of a model.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct MassActionModelData(pub analyses::ode::MassActionProblemData<Uuid>);
