use serde::{Deserialize, Serialize};
use tsify_next::Tsify;
use uuid::Uuid;

use catlog::stdlib::analyses;

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct LotkaVolterraModelData(pub analyses::ode::LotkaVolterraProblemData<Uuid>);

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ODEModelResult(pub analyses::ode::ODEResult<Uuid>);
