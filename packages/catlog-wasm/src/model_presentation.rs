//! Serialization of elaborated models.
//!
//! In contrast to a [model
//! notebook](notebook_types::current::ModelDocumentContent), which is mere
//! *notation*, these data types serialize a fully *elaborated* model. The
//! serialization is as a presentation in terms of generators and relations.

use serde::{Deserialize, Serialize};
use tsify::Tsify;

use catlog::zero::{QualifiedLabel, QualifiedName};
use notebook_types::current::{MorType, Ob, ObType};

/// Presentation of a model of a double theory.
///
/// TODO: Include equations between morphisms.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ModelPresentation {
    /// Generating objects.
    #[serde(rename = "obGenerators")]
    pub ob_generators: Vec<ObGenerator>,

    /// Generating morphisms.
    #[serde(rename = "morGenerators")]
    pub mor_generators: Vec<MorGenerator>,
}

/// Object generator in a model of a double theory.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ObGenerator {
    /// Unique identifier of object.
    pub id: QualifiedName,

    /// Human-readable label for object.
    pub label: Option<QualifiedLabel>,

    /// The object's type in the double theory.
    #[serde(rename = "obType")]
    pub ob_type: ObType,
}

/// Morphism generator in a model of a double theory.
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct MorGenerator {
    /// Unique identifier of morphism.
    pub id: QualifiedName,

    /// Human-readable label for morphism.
    pub label: Option<QualifiedLabel>,

    /// The morphism's type in the double theory.
    #[serde(rename = "morType")]
    pub mor_type: MorType,

    /// Domain of morphism.
    pub dom: Ob,

    /// Codomain of morphism.
    pub cod: Ob,
}
