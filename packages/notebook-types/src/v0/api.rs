use uuid::Uuid;

use serde::{Deserialize, Serialize};
use tsify::Tsify;

/// A stable reference to a document in the database.
///
/// Such a reference identifies a specific document, possibly at a specific
/// version. The keys are prefixed with an underscore, e.g. `_id` instead of
/// `id`, to avoid conflicts with other keys and unambiguously signal that the
/// ID and other data apply at the *database* level, rather than merely the
/// *document* level. The same convention is used in document databases like
/// CouchDB and MongoDB.
#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
#[tsify(missing_as_null)]
pub struct StableRef {
    /// Unique identifier of the referenced document.
    #[serde(rename = "_id")]
    pub id: Uuid,

    /// Version of the document.
    ///
    /// If null, refers to the head snapshot of document. This is the case when
    /// the referenced document will receive live updates.
    #[serde(rename = "_version")]
    pub version: Option<String>,

    /// Server containing the document.
    ///
    /// Assuming one of the official deployments is used, this will be either
    /// `catcolab.org` or `next.catcolab.org`.
    #[serde(rename = "_server")]
    pub server: String,
}

/// A link from one document to another.
///
/// The source of the link is the document containing this data and the target
/// of link is given by the data itself.
#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct Link {
    #[serde(flatten)]
    pub stable_ref: StableRef,

    pub r#type: LinkType,
}

/// Type of link between documents.
#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum LinkType {
    #[serde(rename = "analysis-of")]
    AnalysisOf,

    #[serde(rename = "diagram-in")]
    DiagramIn,

    #[serde(rename = "instantiation")]
    Instantiation,
}
