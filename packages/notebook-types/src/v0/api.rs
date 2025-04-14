use uuid::Uuid;

use serde::{Deserialize, Serialize};
use tsify::Tsify;

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
#[tsify(missing_as_null)]
pub struct StableRef {
    #[serde(rename = "_id")]
    pub id: Uuid,
    #[serde(rename = "_version")]
    pub version: Option<String>,
    #[serde(rename = "_server")]
    pub server: String,
}

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct Link {
    #[serde(flatten)]
    pub stable_ref: StableRef,
    pub r#type: String,
}
