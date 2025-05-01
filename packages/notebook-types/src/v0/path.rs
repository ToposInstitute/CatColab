use serde::{Serialize, Deserialize};
use tsify::Tsify;
use nonempty::NonEmpty;

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum Path<V, E> {
    Id(V),
    Seq(NonEmpty<E>)
}
