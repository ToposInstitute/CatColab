pub use crate::v1::Notebook;

use serde::{Deserialize, Serialize};
use tsify::Tsify;

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ModelNotebook(pub Notebook<super::model_judgment::ModelJudgment>);

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct DiagramNotebook(pub Notebook<super::diagram_judgment::DiagramJudgment>);
