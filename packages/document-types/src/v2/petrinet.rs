use serde::{Deserialize, Serialize};
use tsify::Tsify;
use uuid::Uuid;

/// A type hierarchy mirroring the fragment of SDCPN from [Petrinaut's core
/// library](github.com/hashintel/hash/blob/d3ac60c5509bd2d5a478f2e5a56433c59d353f7b/libs/%40hashintel/petrinaut-core/src/types/sdcpn.ts)
/// which is interpretable in CatColabs conception of Petri nets.

#[derive(PartialEq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct PetriNetDocumentContent {
    pub name: String,
    pub places: Vec<PetriNetPlace>,
    pub transitions: Vec<PetriNetTransition>,
    pub version: String, /* TODO: we may or may not wish to track this
                          * separately from the document version. */
}

#[derive(PartialEq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct PetriNetPlace {
    pub id: Uuid,
    pub name: String,
    pub x: f64,
    pub y: f64,
}

#[derive(PartialEq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct PetriNetTransition {
    pub id: Uuid,
    pub name: String,
    #[serde(rename = "inputArcs")]
    pub input_arcs: Vec<PetriNetArc>,
    #[serde(rename = "outputArcs")]
    pub output_arcs: Vec<PetriNetArc>,
    pub x: f64,
    pub y: f64,
}

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct PetriNetArc {
    #[serde(rename = "placeId")]
    pub place_id: Uuid,
    pub weight: u32,
}
