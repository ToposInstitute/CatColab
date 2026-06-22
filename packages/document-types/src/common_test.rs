//! Shared test helpers for Automerge roundtrip tests.

use automerge::Automerge;
use serde_json::Value;

use crate::automerge_json::{hydrate_to_json, populate_automerge_from_json};

/// Create an Automerge doc populated from a JSON object.
pub fn doc_from_json(value: &Value) -> Automerge {
    let mut doc = Automerge::new();
    doc.transact(|tx| {
        populate_automerge_from_json(tx, automerge::ROOT, value).unwrap();
        Ok::<_, automerge::AutomergeError>(())
    })
    .unwrap();
    doc
}

/// Read the current doc state back as JSON.
pub fn doc_to_json(doc: &Automerge) -> Value {
    let value = doc.hydrate(None);
    hydrate_to_json(&value)
}

/// Roundtrip a JSON object through Automerge and back.
pub fn roundtrip_json(json: &Value) -> Value {
    let doc = doc_from_json(json);
    doc_to_json(&doc)
}
