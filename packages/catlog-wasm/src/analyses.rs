use serde::{Deserialize, Serialize};
use tsify::Tsify;
use uuid::Uuid;

use super::result::JsResult;
use catlog::{stdlib::analyses, zero::name::QualifiedName};

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ODEResult(pub JsResult<analyses::ode::ODESolution<Uuid>, String>);

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ODEResultNext(pub JsResult<analyses::ode::ODESolution<QualifiedName>, String>);

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct LotkaVolterraModelData(pub analyses::ode::LotkaVolterraProblemData);

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct LinearODEModelData(pub analyses::ode::LinearODEProblemData<Uuid>);

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct MassActionModelData(pub analyses::ode::MassActionProblemData<Uuid>);
