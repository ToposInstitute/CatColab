use serde::{Deserialize, Serialize};
use tsify::Tsify;
use ustr::Ustr;

/// Object type in a double theory.
#[derive(Clone, PartialEq, Eq, Hash, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum ObType {
    /// Basic or generating object type.
    Basic(Ustr),

    /// Tabulator of a morphism type.
    Tabulator(Box<MorType>),

    /// Modality applied to an object type.
    ModeApp {
        modality: Modality,

        #[serde(rename = "obType")]
        ob_type: Box<ObType>,
    },
}

/// Morphism type in a double theory.
#[derive(Clone, PartialEq, Eq, Hash, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum MorType {
    /// Basic or generating morphism type.
    Basic(Ustr),

    /// Hom type or unit on an object type.
    Hom(Box<ObType>),

    /// Composite of morphism types.
    Composite(Vec<MorType>),

    /// Modality applied to a morphism type.
    ModeApp {
        modality: Modality,

        #[serde(rename = "morType")]
        mor_type: Box<MorType>,
    },
}

/// Object operation in a double theory.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum ObOp {
    /// Basic or generating object operation.
    Basic(Ustr),

    /// Identity operation on an object type.
    Id(ObType),

    /// Composite of object operations.
    Composite(Vec<ObOp>),

    /// Modality applied to an object operation.
    ModeApp { modality: Modality, op: Box<ObOp> },
}

/// Modality available in a modal double theory.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum Modality {
    Discrete,
    Codiscrete,
    List,
    SymmetricList,
    CoproductList,
    ProductList,
    BiproductList,
}
