use serde::{Deserialize, Serialize};
use tsify::Tsify;
use uuid::Uuid;

use super::{path::Path, theory::*};

/// An object in a model of a double theory.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub enum Ob {
    /// Basic or generating object.
    Basic(Uuid),

    /// Application of an object operation to another object.
    App { op: ObOp, ob: Box<Ob> },

    /// List of objects, each possibly ill-defined, in a list modality.
    List {
        modality: Modality,
        objects: Vec<Option<Ob>>,
    },

    /// Morphism viewed as an object of a tabulator.
    Tabulated(Mor),
}

/// A morphism in a model of a double theory.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum Mor {
    /// Basic or generating morphism.
    Basic(Uuid),

    /// Composite of morphisms.
    Composite(Box<Path<Ob, Mor>>),

    /// Morphism between tabulated morphisms, a commutative square.
    TabulatorSquare {
        dom: Box<Mor>,
        cod: Box<Mor>,
        pre: Box<Mor>,
        post: Box<Mor>,
    },
}
