use serde::{Deserialize, Serialize};
use serde_json::Value;
use tsify::Tsify;

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct Analysis {
    id: String,
    content: Value,
}
