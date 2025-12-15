//! Utilities for converting JSON values to Automerge documents.

use automerge::transaction::Transactable;
use serde_json::Value;

/// Insert a JSON value into a map property
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

/// Insert a JSON value into a list at index
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
