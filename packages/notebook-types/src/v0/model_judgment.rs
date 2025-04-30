use uuid::Uuid;
use serde::{Serialize, Deserialize};
use tsify::Tsify;
use catlog::one::Path;

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
}

/// Morphism type in a double theory.
#[derive(Clone, PartialEq, Eq, Hash, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum MorType {
    /// Basic or generating morphism type.
    Basic(Ustr),

    /// Hom type on an object type.
    Hom(Box<ObType>),
}

/// An object in a model of a double theory.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag", content = "content")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum Ob {
    /// Basic or generating object.
    Basic(Uuid),

    /// Morphism viewed as an object of a tabulator.
    Tabulated(Mor),
}

/// A morphism in a model of a double theory.
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
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

pub type ModelJudgment = ModelDecl;

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum ModelDecl {
    #[serde(rename="object")]
    ObjectDecl {
        name: String,
        id: Uuid,
        #[serde(rename="obType")]
        ob_type: ObType
    },
    #[serde(rename="morphism")]
    MorphismDecl {
        name: String,
        id: Uuid,
        #[serde(rename="morType")]
        mor_type: MorType,
        dom: Option<Ob>,
        cod: Option<Ob>
    }
}
