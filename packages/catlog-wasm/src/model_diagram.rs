//! Wasm bindings for diagrams in models of a double theory.

use uuid::Uuid;

use serde::{Deserialize, Serialize};
use tsify_next::Tsify;
use wasm_bindgen::prelude::*;

use catlog::dbl;
use catlog::one::fin_category::UstrFinCategory;

use super::model::{Mor, Ob};
use super::theory::{MorType, ObType};

/// Declares an object of a diagram in a model.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct DiagramObDecl {
    /// Globally unique identifier of object.
    pub id: Uuid,

    /// The object's type in the double theory.
    #[serde(rename = "obType")]
    pub ob_type: ObType,

    /// Object in the model that this object is over, if defined.
    pub over: Option<Ob>,
}

/// Declares a morphism of a diagram in a model.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, missing_as_null)]
pub struct DiagramMorDecl {
    /// Globally unique identifier of morphism.
    pub id: Uuid,

    /// The morphism's type in the double theory.
    #[serde(rename = "morType")]
    pub mor_type: MorType,

    /// Morphism in the model that this morphism is over, if defined.
    pub over: Option<Mor>,

    /// Domain of this morphism, if defined.
    pub dom: Option<Ob>,

    /// Codomain of this morphism, if defined.
    pub cod: Option<Ob>,
}

type DiscreteDblModelDiagram = dbl::model_diagram::DblModelDiagram<Uuid, UstrFinCategory>;

/// A box containing a diagram in a model of a double theory.
pub enum DblModelDiagramBox {
    Discrete(DiscreteDblModelDiagram),
}
