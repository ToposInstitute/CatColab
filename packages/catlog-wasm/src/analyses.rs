use serde::{Deserialize, Serialize};
use tsify_next::Tsify;
use uuid::Uuid;

use catlog::stdlib::analyses;

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct LotkaVolterraModelData(pub analyses::lotka_volterra::LotkaVolterraProblemData<Uuid>);

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct LotkaVolterraModelResult(pub analyses::lotka_volterra::LotkaVolterraResult<Uuid>);
