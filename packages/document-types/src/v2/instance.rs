use serde::{Deserialize, Serialize};
use tsify::Tsify;

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
pub struct Table {}
