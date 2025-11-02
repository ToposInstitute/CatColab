//! Serialization of elaborated diagrams.

use serde::{Deserialize, Serialize};
use tsify::Tsify;

use catlog::zero::{QualifiedLabel, QualifiedName};
use notebook_types::current::{Mor, MorType, Ob, ObType};

/// Presentation of a free diagram in a model.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ModelDiagramPresentation {
    /// Generating objects.
    #[serde(rename = "obGenerators")]
    pub ob_generators: Vec<DiagramObGenerator>,

    /// Generating morphisms.
    #[serde(rename = "morGenerators")]
    pub mor_generators: Vec<DiagramMorGenerator>,
}

/// Object generator in a diagram in a model.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct DiagramObGenerator {
    /// Unique identifier of object.
    pub id: QualifiedName,

    /// Human-readable label for object.
    pub label: Option<QualifiedLabel>,

    /// The object's type in the double theory.
    #[serde(rename = "obType")]
    pub ob_type: ObType,

    /// Object in the model that this object is over.
    pub over: Ob,
}

/// Morphism generator in a diagram in a model.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct DiagramMorGenerator {
    /// Unique identifier of morphism.
    pub id: QualifiedName,

    /// The morphism's type in the double theory.
    #[serde(rename = "morType")]
    pub mor_type: MorType,

    /// Morphism in the model that this morphism is over.
    pub over: Mor,

    /// Domain of this morphism.
    pub dom: Ob,

    /// Codomain of this morphism.
    pub cod: Ob,
}
