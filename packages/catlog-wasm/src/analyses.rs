use serde::{Deserialize, Serialize};
use tsify::Tsify;
use uuid::Uuid;

use super::result::JsResult;
use catlog::stdlib::analyses;

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ODEResult(pub JsResult<analyses::ode::ODESolution<Uuid>, String>);

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct LotkaVolterraModelData(pub analyses::ode::LotkaVolterraProblemData<Uuid>);

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct LinearODEModelData(pub analyses::ode::LinearODEProblemData<Uuid>);

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct MassActionModelData(pub analyses::ode::MassActionProblemData<Uuid>);

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct AnotherMassActionModelData(pub analyses::ode::AnotherMassActionProblemData<Uuid>);
