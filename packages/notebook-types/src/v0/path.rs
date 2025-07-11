use nonempty::NonEmpty;
use serde::{Deserialize, Serialize};
use tsify::Tsify;

#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum Path<V, E> {
    Id(V),
    Seq(NonEmpty<E>),
}
