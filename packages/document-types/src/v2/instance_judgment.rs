use serde::{Deserialize, Serialize};
use tsify::Tsify;

/// A judgment defining part of a instance in a model.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum InstanceJudgment {
    #[serde(rename = "nullJudgment")]
    NullJudgment,
}
