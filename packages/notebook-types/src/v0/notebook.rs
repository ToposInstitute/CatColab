use super::cell::Cell;

use serde::{Serialize, Deserialize};
use tsify::Tsify;

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct Notebook<T> {
    cells: Vec<Cell<T>>
}
