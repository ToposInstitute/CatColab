use super::cell::NotebookCell;

use serde::{Deserialize, Serialize};
use tsify::Tsify;

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct Notebook<T> {
    pub cells: Vec<NotebookCell<T>>,
}
