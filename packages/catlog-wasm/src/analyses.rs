use serde::{Deserialize, Serialize};
use tsify_next::Tsify;
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
pub struct CCLFOModelData(pub analyses::ode::CCLFOProblemData<Uuid>);

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct MassActionModelData(pub analyses::ode::MassActionProblemData<Uuid>);
