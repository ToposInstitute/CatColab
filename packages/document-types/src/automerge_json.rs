//! Utilities for converting between JSON values and Automerge documents.

use automerge::hydrate;
use automerge::marks::{MarkSet, UpdateSpansConfig};
use automerge::transaction::Transactable;
use automerge::{ScalarValue, Span};
use serde_json::{Map as JsonMap, Value};
use std::collections::HashMap;
use std::sync::Arc;

/// The JSON property name under which rich-text content is stored in a cell.
const RICH_TEXT_KEY: &str = "content";

/// Convert a JSON value into an Automerge `ScalarValue` (for marks/attrs).
fn json_to_scalar(v: &Value) -> ScalarValue {
    match v {
        Value::String(s) => ScalarValue::Str(s.as_str().into()),
        Value::Bool(b) => ScalarValue::Boolean(*b),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                ScalarValue::Int(i)
            } else if let Some(f) = n.as_f64() {
                ScalarValue::F64(f)
            } else {
                ScalarValue::Null
            }
        }
        Value::Null => ScalarValue::Null,
        // Marks and block attributes are expected to be scalars; fall back to
        // a JSON-encoded string for anything structured so no data is dropped.
        other => ScalarValue::Str(other.to_string().into()),
    }
}

/// Convert a JSON value into a `hydrate::Value` (for block marker maps).
fn json_to_hydrate_value(v: &Value) -> hydrate::Value {
    match v {
        Value::Object(obj) => {
            let map: HashMap<String, hydrate::Value> =
                obj.iter().map(|(k, val)| (k.clone(), json_to_hydrate_value(val))).collect();
            hydrate::Value::Map(hydrate::Map::from(map))
        }
        Value::Array(arr) => {
            let items: Vec<hydrate::Value> = arr.iter().map(json_to_hydrate_value).collect();
            hydrate::Value::List(hydrate::List::from(items))
        }
        scalar => hydrate::Value::Scalar(json_to_scalar(scalar)),
    }
}

/// Convert a JSON spans array into a vector of Automerge `Span`s.
fn json_to_spans(value: &Value) -> Vec<Span> {
    let arr = match value.as_array() {
        Some(arr) => arr,
        None => return Vec::new(),
    };
    let mut spans = Vec::with_capacity(arr.len());
    for item in arr {
        let Some(obj) = item.as_object() else {
            continue;
        };
        match obj.get("type").and_then(Value::as_str) {
            Some("text") => {
                let text = obj.get("value").and_then(Value::as_str).unwrap_or("").to_string();
                let marks = obj.get("marks").and_then(Value::as_object).and_then(|marks_obj| {
                    if marks_obj.is_empty() {
                        None
                    } else {
                        let set: MarkSet = marks_obj
                            .iter()
                            .map(|(name, v)| (name.clone(), json_to_scalar(v)))
                            .collect();
                        Some(Arc::new(set))
                    }
                });
                spans.push(Span::Text { text, marks });
            }
            Some("block") => {
                if let Some(block_obj) = obj.get("block").and_then(Value::as_object) {
                    let map: HashMap<String, hydrate::Value> = block_obj
                        .iter()
                        .map(|(k, v)| (k.clone(), json_to_hydrate_value(v)))
                        .collect();
                    spans.push(Span::Block(hydrate::Map::from(map)));
                }
            }
            _ => {}
        }
    }
    spans
}

/// Insert a rich-text spans array as an Automerge `Text` object under `key`.
fn insert_spans_into_map<'a>(
    tx: &mut automerge::transaction::Transaction<'a>,
    parent: &automerge::ObjId,
    key: &str,
    value: &Value,
) -> Result<(), automerge::AutomergeError> {
    let text_id = tx.put_object(parent, key, automerge::ObjType::Text)?;
    let spans = json_to_spans(value);
    tx.update_spans(&text_id, UpdateSpansConfig::default(), spans)
}

/// Returns `true` if the JSON object is a rich-text cell (`tag == "rich-text"`).
fn json_is_rich_text_cell(map: &JsonMap<String, Value>) -> bool {
    map.get("tag").and_then(Value::as_str) == Some(RICH_TEXT_CELL_TAG)
}

/// Insert a JSON value into a map property.
///
/// `parent_is_rich_text_cell` indicates whether `parent` is a rich-text cell,
/// in which case a `content` array is materialized as an Automerge `Text`
/// object (with marks and block markers) rather than a plain `List`.
fn insert_value_into_map<'a>(
    tx: &mut automerge::transaction::Transaction<'a>,
    parent: &automerge::ObjId,
    key: &str,
    value: &Value,
    parent_is_rich_text_cell: bool,
) -> Result<(), automerge::AutomergeError> {
    // Inside a rich-text cell, the `content` array (including an empty one) is
    // always materialized as a Text object, never a plain List.
    if parent_is_rich_text_cell && key == RICH_TEXT_KEY && value.is_array() {
        return insert_spans_into_map(tx, parent, key, value);
    }

    match value {
        Value::String(s) => {
            // Use ObjType::Text instead of scalar string to avoid ImmutableString in JavaScript
            let text_id = tx.put_object(parent, key, automerge::ObjType::Text)?;
            tx.splice_text(&text_id, 0, 0, s.as_str())?;
        }
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                tx.put(parent, key, i)?;
            } else if let Some(f) = n.as_f64() {
                tx.put(parent, key, f)?;
            }
        }
        Value::Bool(b) => {
            tx.put(parent, key, *b)?;
        }
        Value::Null => {
            tx.put(parent, key, ())?;
        }
        Value::Object(map) => {
            let obj_id = tx.put_object(parent, key, automerge::ObjType::Map)?;
            let is_rich_text = json_is_rich_text_cell(map);
            for (nested_key, nested_val) in map {
                insert_value_into_map(tx, &obj_id, nested_key.as_str(), nested_val, is_rich_text)?;
            }
        }
        Value::Array(arr) => {
            let list_id = tx.put_object(parent, key, automerge::ObjType::List)?;
            for (i, item) in arr.iter().enumerate() {
                insert_value_into_list(tx, &list_id, i, item)?;
            }
        }
    }
    Ok(())
}

/// Insert a JSON value into a list at index.
fn insert_value_into_list<'a>(
    tx: &mut automerge::transaction::Transaction<'a>,
    parent: &automerge::ObjId,
    index: usize,
    value: &Value,
) -> Result<(), automerge::AutomergeError> {
    match value {
        Value::String(s) => {
            // Use ObjType::Text instead of scalar string to avoid ImmutableString in JavaScript
            let text_id = tx.insert_object(parent, index, automerge::ObjType::Text)?;
            tx.splice_text(&text_id, 0, 0, s.as_str())?;
        }
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                tx.insert(parent, index, i)?;
            } else if let Some(f) = n.as_f64() {
                tx.insert(parent, index, f)?;
            }
        }
        Value::Bool(b) => {
            tx.insert(parent, index, *b)?;
        }
        Value::Null => {
            tx.insert(parent, index, ())?;
        }
        Value::Object(map) => {
            let obj_id = tx.insert_object(parent, index, automerge::ObjType::Map)?;
            let is_rich_text = json_is_rich_text_cell(map);
            for (nested_key, nested_val) in map {
                insert_value_into_map(tx, &obj_id, nested_key.as_str(), nested_val, is_rich_text)?;
            }
        }
        Value::Array(arr) => {
            let list_id = tx.insert_object(parent, index, automerge::ObjType::List)?;
            for (i, item) in arr.iter().enumerate() {
                insert_value_into_list(tx, &list_id, i, item)?;
            }
        }
    }
    Ok(())
}

/// Populate an automerge document from a JSON value.
pub fn populate_automerge_from_json<'a>(
    tx: &mut automerge::transaction::Transaction<'a>,
    obj_id: automerge::ObjId,
    value: &Value,
) -> Result<(), automerge::AutomergeError> {
    let Value::Object(map) = value else {
        let value_type = match value {
            Value::Null => "Null",
            Value::Bool(_) => "Bool",
            Value::Number(_) => "Number",
            Value::String(_) => "String",
            Value::Array(_) => "Array",
            Value::Object(_) => unreachable!(),
        };

        return Err(automerge::AutomergeError::InvalidValueType {
            expected: "Object".to_string(),
            unexpected: format!("{} as document root", value_type),
        });
    };

    let is_rich_text = json_is_rich_text_cell(map);
    for (key, val) in map {
        insert_value_into_map(tx, &obj_id, key.as_str(), val, is_rich_text)?;
    }

    Ok(())
}

/// Convert automerge hydrate::Value to serde_json::Value.
pub fn hydrate_to_json(value: &hydrate::Value) -> Value {
    match value {
        hydrate::Value::Scalar(s) => scalar_to_json(s),
        hydrate::Value::Map(m) => {
            let mut map = serde_json::Map::new();
            for (key, map_value) in m.iter() {
                map.insert(key.to_string(), hydrate_to_json(&map_value.value));
            }
            Value::Object(map)
        }
        hydrate::Value::List(l) => {
            Value::Array(l.iter().map(|list_value| hydrate_to_json(&list_value.value)).collect())
        }
        hydrate::Value::Text(t) => Value::String(t.to_string()),
    }
}

/// Serialize an Automerge `Text` object to a JSON spans array, preserving marks
/// and block markers (headings, lists, `math_inline`, `math_display`, ...).
fn text_spans_to_json(
    doc: &impl automerge::ReadDoc,
    text_id: &automerge::ObjId,
) -> Result<Value, automerge::AutomergeError> {
    let mut out = Vec::new();
    for span in doc.spans(text_id)? {
        match span {
            Span::Text { text, marks } => {
                let mut obj = JsonMap::new();
                obj.insert("type".to_string(), Value::String("text".to_string()));
                obj.insert("value".to_string(), Value::String(text));
                if let Some(marks) = marks {
                    let mut marks_json = JsonMap::new();
                    for (name, value) in marks.iter() {
                        marks_json.insert(name.to_string(), scalar_to_json(value));
                    }
                    if !marks_json.is_empty() {
                        obj.insert("marks".to_string(), Value::Object(marks_json));
                    }
                }
                out.push(Value::Object(obj));
            }
            Span::Block(map) => {
                let mut obj = JsonMap::new();
                obj.insert("type".to_string(), Value::String("block".to_string()));
                obj.insert("block".to_string(), hydrate_to_json(&hydrate::Value::Map(map)));
                out.push(Value::Object(obj));
            }
        }
    }
    Ok(Value::Array(out))
}

/// Serialize a whole Automerge document to JSON, converting rich-text `Text`
/// objects (stored under the `content` property) into structured spans
/// arrays so that marks and block markers survive the round-trip.
///
/// Unlike [`hydrate_to_json`], which flattens every `Text` to a plain string,
/// this reads spans directly from the document.
pub fn hydrate_to_json_with_rich_text(
    doc: &impl automerge::ReadDoc,
) -> Result<Value, automerge::AutomergeError> {
    map_to_json(doc, &automerge::ROOT)
}

/// The discriminator tag identifying a rich-text notebook cell.
const RICH_TEXT_CELL_TAG: &str = "rich-text";

/// Returns `true` if the map object `obj_id` is a rich-text cell, i.e. it has a
/// scalar string property `tag` equal to [`RICH_TEXT_CELL_TAG`].
fn is_rich_text_cell(
    doc: &impl automerge::ReadDoc,
    obj_id: &automerge::ObjId,
) -> Result<bool, automerge::AutomergeError> {
    match doc.get(obj_id, "tag")? {
        Some((automerge::Value::Scalar(s), _)) => match s.as_ref() {
            ScalarValue::Str(tag) => Ok(tag == RICH_TEXT_CELL_TAG),
            _ => Ok(false),
        },
        // The tag may be stored as a Text object rather than a scalar string.
        Some((automerge::Value::Object(automerge::ObjType::Text), tag_id)) => {
            Ok(doc.text(&tag_id)? == RICH_TEXT_CELL_TAG)
        }
        _ => Ok(false),
    }
}

fn map_to_json(
    doc: &impl automerge::ReadDoc,
    obj_id: &automerge::ObjId,
) -> Result<Value, automerge::AutomergeError> {
    let rich_text_cell = is_rich_text_cell(doc, obj_id)?;
    let mut map = JsonMap::new();
    for key in doc.keys(obj_id) {
        if let Some((value, child_id)) = doc.get(obj_id, &key)? {
            // Only the `content` of a rich-text cell is serialized as spans.
            let as_spans = rich_text_cell && key == RICH_TEXT_KEY;
            map.insert(key.clone(), value_to_json(doc, &value, &child_id, as_spans)?);
        }
    }
    Ok(Value::Object(map))
}

fn list_to_json(
    doc: &impl automerge::ReadDoc,
    obj_id: &automerge::ObjId,
) -> Result<Value, automerge::AutomergeError> {
    let len = doc.length(obj_id);
    let mut arr = Vec::with_capacity(len);
    for i in 0..len {
        if let Some((value, child_id)) = doc.get(obj_id, i)? {
            arr.push(value_to_json(doc, &value, &child_id, false)?);
        }
    }
    Ok(Value::Array(arr))
}

fn value_to_json(
    doc: &impl automerge::ReadDoc,
    value: &automerge::Value<'_>,
    obj_id: &automerge::ObjId,
    as_spans: bool,
) -> Result<Value, automerge::AutomergeError> {
    use automerge::ObjType;
    match value {
        automerge::Value::Object(ObjType::Text) => {
            // Rich-text cell content becomes a spans array; every other Text
            // object (e.g. a `Basic` judgment's string) is a plain string.
            if as_spans {
                text_spans_to_json(doc, obj_id)
            } else {
                Ok(Value::String(doc.text(obj_id)?))
            }
        }
        automerge::Value::Object(ObjType::Map) => map_to_json(doc, obj_id),
        automerge::Value::Object(ObjType::List) => list_to_json(doc, obj_id),
        automerge::Value::Object(ObjType::Table) => map_to_json(doc, obj_id),
        automerge::Value::Scalar(s) => Ok(scalar_to_json(s)),
    }
}

fn scalar_to_json(s: &automerge::ScalarValue) -> Value {
    use automerge::ScalarValue;
    match s {
        ScalarValue::Bytes(b) => {
            Value::Array(b.iter().map(|v| Value::Number((*v).into())).collect())
        }
        ScalarValue::Str(s) => Value::String(s.to_string()),
        ScalarValue::Int(i) => Value::Number((*i).into()),
        ScalarValue::Uint(u) => Value::Number((*u).into()),
        ScalarValue::F64(f) => {
            serde_json::Number::from_f64(*f).map(Value::Number).unwrap_or(Value::Null)
        }
        ScalarValue::Counter(c) => Value::Number(i64::from(c).into()),
        ScalarValue::Timestamp(t) => Value::Number((*t).into()),
        ScalarValue::Boolean(b) => Value::Bool(*b),
        ScalarValue::Null => Value::Null,
        ScalarValue::Unknown { type_code, bytes } => Value::Object(serde_json::Map::from_iter([
            ("type_code".to_string(), Value::Number((*type_code).into())),
            (
                "bytes".to_string(),
                Value::Array(bytes.iter().map(|b| Value::Number((*b).into())).collect()),
            ),
        ])),
    }
}

#[cfg(all(test, feature = "property-tests"))]
mod property_tests {
    use super::*;
    use crate::common_test::roundtrip_json;
    use crate::current::notebook::ModelNotebook;
    use automerge::Automerge;
    use test_strategy::proptest;

    /// A `ModelNotebook` survives a JSON → Automerge → JSON roundtrip.
    #[proptest(cases = 64)]
    fn model_notebook_roundtrips_through_automerge(notebook: ModelNotebook) {
        let json = serde_json::to_value(&notebook.0).expect("serialize to JSON");
        let result = roundtrip_json(&json);
        proptest::prop_assert_eq!(json, result);
    }

    /// Non-object root values are rejected by `populate_automerge_from_json`.
    #[proptest(cases = 64)]
    fn non_object_root_is_rejected(value: bool) {
        let json = Value::Bool(value);
        let mut doc = Automerge::new();
        let result = doc.transact(|tx| populate_automerge_from_json(tx, automerge::ROOT, &json));
        proptest::prop_assert!(result.is_err());
    }
}

/// Unit tests for lossless rich-text (spans) round-tripping through JSON,
/// including marks (bold) and LaTeX math block markers.
///
/// Folded in from the original feasibility spike: these exercise the real
/// production conversion (`populate_automerge_from_json` /
/// `hydrate_doc_to_json`) rather than standalone helpers.
#[cfg(all(test, feature = "backend"))]
mod rich_text_tests {
    use super::*;
    use automerge::ReadDoc;
    use serde_json::json;

    /// Build a rich-text cell whose `content` is a spans array with a bold run,
    /// an inline-math block marker, and trailing text.
    ///
    /// The block shape (`type` / `attrs` / `parents`) mirrors what the
    /// `@automerge/prosemirror` binding emits for a `math_inline` node.
    fn sample_cell_json() -> Value {
        json!({
            "tag": "rich-text",
            "id": "00000000-0000-0000-0000-000000000001",
            "content": [
                { "type": "text", "value": "E = ", "marks": { "strong": true } },
                {
                    "type": "block",
                    "block": {
                        "type": "math_inline",
                        "attrs": { "tex": "mc^2" },
                        "parents": []
                    }
                },
                { "type": "text", "value": " (mass-energy)" }
            ]
        })
    }

    /// Wrap a cell in a minimal document so the rich-text `tag` context is
    /// present (rich-text content is only recognized inside a tagged cell).
    fn doc_with_cell(cell: Value) -> Value {
        json!({ "cell": cell })
    }

    /// Rich-text content survives a JSON → Automerge → JSON round-trip with
    /// marks and the math `tex` attribute intact.
    #[test]
    fn rich_text_spans_roundtrip_through_json() {
        let json = doc_with_cell(sample_cell_json());

        let mut doc = automerge::Automerge::new();
        doc.transact(|tx| populate_automerge_from_json(tx, automerge::ROOT, &json))
            .unwrap();

        // The cell's `content` must be a real Automerge Text object, not a List.
        let (_, cell_id) = doc.get(automerge::ROOT, "cell").unwrap().unwrap();
        let (value, _) = doc.get(&cell_id, "content").unwrap().unwrap();
        assert!(
            matches!(value, automerge::Value::Object(automerge::ObjType::Text)),
            "content should be a Text object, got {value:?}"
        );

        let result = hydrate_to_json_with_rich_text(&doc).unwrap();
        assert_eq!(json, result);
    }

    /// The serialized shape carries the expected marks and math attributes.
    #[test]
    fn rich_text_json_has_expected_shape() {
        let json = doc_with_cell(sample_cell_json());
        let mut doc = automerge::Automerge::new();
        doc.transact(|tx| populate_automerge_from_json(tx, automerge::ROOT, &json))
            .unwrap();

        let result = hydrate_to_json_with_rich_text(&doc).unwrap();
        let spans = result["cell"]["content"].as_array().expect("spans array");

        assert_eq!(spans[0]["type"], "text");
        assert_eq!(spans[0]["marks"]["strong"], true);

        let block = spans.iter().find(|s| s["type"] == "block").expect("a block span");
        assert_eq!(block["block"]["type"], "math_inline");
        assert_eq!(block["block"]["attrs"]["tex"], "mc^2");
    }

    /// A plain (unmarked) text span round-trips without gaining a `marks` key.
    #[test]
    fn plain_text_span_has_no_marks_key() {
        let json = doc_with_cell(json!({
            "tag": "rich-text",
            "id": "00000000-0000-0000-0000-000000000002",
            "content": [ { "type": "text", "value": "plain" } ]
        }));
        let mut doc = automerge::Automerge::new();
        doc.transact(|tx| populate_automerge_from_json(tx, automerge::ROOT, &json))
            .unwrap();

        let result = hydrate_to_json_with_rich_text(&doc).unwrap();
        assert_eq!(json, result);
        assert!(result["cell"]["content"][0].get("marks").is_none());
    }

    /// String content is accepted and normalized to spans.
    #[test]
    fn legacy_rich_text_string_serializes_as_spans() {
        let json = doc_with_cell(json!({
            "tag": "rich-text",
            "id": "00000000-0000-0000-0000-000000000004",
            "content": "legacy text"
        }));
        let mut doc = automerge::Automerge::new();
        doc.transact(|tx| populate_automerge_from_json(tx, automerge::ROOT, &json))
            .unwrap();

        let result = hydrate_to_json_with_rich_text(&doc).unwrap();
        assert_eq!(result["cell"]["content"], json!([{ "type": "text", "value": "legacy text" }]));
    }

    /// A `content` string that is NOT inside a rich-text cell (e.g. a `Basic`
    /// model judgment) round-trips as a plain string, not a spans array.
    #[test]
    fn non_rich_text_content_string_is_unaffected() {
        let json = json!({
            "cell": {
                "tag": "formal",
                "id": "00000000-0000-0000-0000-000000000003",
                "content": { "tag": "Basic", "content": "some object name" }
            }
        });
        let mut doc = automerge::Automerge::new();
        doc.transact(|tx| populate_automerge_from_json(tx, automerge::ROOT, &json))
            .unwrap();

        let result = hydrate_to_json_with_rich_text(&doc).unwrap();
        assert_eq!(json, result);
        assert_eq!(result["cell"]["content"]["content"], "some object name");
    }
}
