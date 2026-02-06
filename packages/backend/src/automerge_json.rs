//! Utilities for converting between JSON values and Automerge documents.

use crate::app::AppState;
use crate::document::{RefContent, autosave};
use automerge::hydrate;
use automerge::transaction::Transactable;
use futures_util::stream::StreamExt;
use samod::DocHandle;
use serde_json::Value;
use uuid::Uuid;

/// Insert a JSON value into a map property.
fn insert_value_into_map<'a>(
    tx: &mut automerge::transaction::Transaction<'a>,
    parent: &automerge::ObjId,
    key: &str,
    value: &Value,
) -> Result<(), automerge::AutomergeError> {
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
            for (nested_key, nested_val) in map {
                insert_value_into_map(tx, &obj_id, nested_key.as_str(), nested_val)?;
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
            for (nested_key, nested_val) in map {
                insert_value_into_map(tx, &obj_id, nested_key.as_str(), nested_val)?;
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
pub(crate) fn populate_automerge_from_json<'a>(
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

    for (key, val) in map {
        insert_value_into_map(tx, &obj_id, key.as_str(), val)?;
    }

    Ok(())
}

/// Convert automerge hydrate::Value to serde_json::Value.
pub(crate) fn hydrate_to_json(value: &hydrate::Value) -> Value {
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

/// Spawns a background task that listens for document changes and triggers autosave.
pub(crate) async fn ensure_autosave_listener(state: AppState, ref_id: Uuid, doc_handle: DocHandle) {
    let listeners = state.active_listeners.read().await;
    if listeners.contains(&ref_id) {
        return;
    }

    // Explicitly drop the read lock before acquiring write lock
    drop(listeners);

    let mut listeners = state.active_listeners.write().await;
    listeners.insert(ref_id);

    tokio::spawn({
        let state = state.clone();
        async move {
            let mut changes = doc_handle.changes();

            while (changes.next().await).is_some() {
                let cloned_doc = doc_handle.with_document(|doc| doc.clone());
                let hydrated = cloned_doc.hydrate(None);
                let content = hydrate_to_json(&hydrated);

                let data = RefContent { ref_id, content };
                if let Err(e) = autosave(state.clone(), data).await {
                    tracing::error!("Autosave failed for ref {}: {:?}", ref_id, e);
                }
            }

            state.active_listeners.write().await.remove(&ref_id);
            tracing::error!("Autosave listener stopped for ref {}", ref_id);
        }
    });
}
