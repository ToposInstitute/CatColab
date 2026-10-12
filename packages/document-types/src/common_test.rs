//! Shared test helpers for Automerge roundtrip tests.

use automerge::Automerge;
use serde_json::Value;

use crate::automerge_json::{auomerge_doc_from_json, hydrate_to_json_with_rich_text};

/// Create an Automerge doc populated from a JSON object.
pub fn doc_from_json(value: &Value) -> Automerge {
    auomerge_doc_from_json(value).unwrap()
}

/// Read the current doc state back as JSON.
pub fn doc_to_json(doc: &Automerge) -> Value {
    hydrate_to_json_with_rich_text(doc).unwrap()
}

/// Roundtrip a JSON object through Automerge and back.
#[cfg(feature = "property-tests")]
pub fn roundtrip_json(json: &Value) -> Value {
    let doc = doc_from_json(json);
    doc_to_json(&doc)
}
