//! Utilities for converting between JSON values and Automerge documents.

use automerge::hydrate;
use automerge::transaction::Transactable;
use serde_json::Value;

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

    for (key, val) in map {
        insert_value_into_map(tx, &obj_id, key.as_str(), val)?;
    }

    Ok(())
}

/// Overwrite the document root with the state at `target_heads`.
///
/// Unlike the `hydrate_to_json` + `populate_automerge_from_json` round-trip,
/// this preserves rich-text marks and block markers on Text objects by using
/// `marks_at` / `mark` instead of going through a plain-string intermediary.
pub fn copy_doc_at_heads<'a>(
    tx: &mut automerge::transaction::Transaction<'a>,
    target_heads: &[automerge::ChangeHash],
) -> Result<(), automerge::AutomergeError> {
    use automerge::ReadDoc;

    let current_keys: Vec<String> = tx.keys(automerge::ROOT).collect();
    for key in &current_keys {
        tx.delete(automerge::ROOT, key.as_str())?;
    }

    let target_entries: Vec<_> = {
        let keys: Vec<String> = tx.keys_at(automerge::ROOT, target_heads).collect();
        keys.into_iter()
            .filter_map(|key| {
                tx.get_at(automerge::ROOT, key.as_str(), target_heads)
                    .ok()
                    .flatten()
                    .map(|(v, id)| (key, v.to_owned(), id))
            })
            .collect()
    };
    for (key, value, source_id) in &target_entries {
        put_value_into_map(tx, &automerge::ROOT, key, value, source_id, target_heads)?;
    }
    Ok(())
}

fn collect_children_map(
    tx: &automerge::transaction::Transaction<'_>,
    source_id: &automerge::ObjId,
    heads: &[automerge::ChangeHash],
) -> Vec<(String, automerge::Value<'static>, automerge::ObjId)> {
    use automerge::ReadDoc;
    let keys: Vec<String> = tx.keys_at(source_id, heads).collect();
    keys.into_iter()
        .filter_map(|key| {
            tx.get_at(source_id, key.as_str(), heads)
                .ok()
                .flatten()
                .map(|(v, id)| (key, v.to_owned(), id))
        })
        .collect()
}

fn collect_children_list(
    tx: &automerge::transaction::Transaction<'_>,
    source_id: &automerge::ObjId,
    heads: &[automerge::ChangeHash],
) -> Vec<(automerge::Value<'static>, automerge::ObjId)> {
    use automerge::ReadDoc;
    let len = tx.length_at(source_id, heads);
    (0..len)
        .filter_map(|i| {
            tx.get_at(source_id, i, heads)
                .ok()
                .flatten()
                .map(|(v, id)| (v.to_owned(), id))
        })
        .collect()
}

fn copy_text_spans<'a>(
    tx: &mut automerge::transaction::Transaction<'a>,
    new_id: &automerge::ObjId,
    source_id: &automerge::ObjId,
    heads: &[automerge::ChangeHash],
) -> Result<(), automerge::AutomergeError> {
    use automerge::ReadDoc;
    let spans: Vec<automerge::Span> = tx.spans_at(source_id, heads)?.collect();
    tx.update_spans(
        new_id,
        automerge::marks::UpdateSpansConfig::default(),
        spans,
    )
}

fn put_value_into_map<'a>(
    tx: &mut automerge::transaction::Transaction<'a>,
    parent: &automerge::ObjId,
    key: &str,
    value: &automerge::Value<'_>,
    source_id: &automerge::ObjId,
    heads: &[automerge::ChangeHash],
) -> Result<(), automerge::AutomergeError> {
    use automerge::ObjType;

    match value {
        automerge::Value::Object(ObjType::Text) => {
            let new_id = tx.put_object(parent, key, ObjType::Text)?;
            copy_text_spans(tx, &new_id, source_id, heads)?;
        }
        automerge::Value::Object(ObjType::Map) => {
            let new_id = tx.put_object(parent, key, ObjType::Map)?;
            let children = collect_children_map(tx, source_id, heads);
            for (child_key, child_val, child_src) in &children {
                put_value_into_map(tx, &new_id, child_key, child_val, child_src, heads)?;
            }
        }
        automerge::Value::Object(ObjType::List) => {
            let new_id = tx.put_object(parent, key, ObjType::List)?;
            let children = collect_children_list(tx, source_id, heads);
            for (i, (child_val, child_src)) in children.iter().enumerate() {
                insert_value_into_list_from_doc(tx, &new_id, i, child_val, child_src, heads)?;
            }
        }
        automerge::Value::Object(obj_type) => {
            tx.put_object(parent, key, *obj_type)?;
        }
        automerge::Value::Scalar(s) => {
            tx.put(parent, key, s.as_ref().clone())?;
        }
    }
    Ok(())
}

fn insert_value_into_list_from_doc<'a>(
    tx: &mut automerge::transaction::Transaction<'a>,
    parent: &automerge::ObjId,
    index: usize,
    value: &automerge::Value<'_>,
    source_id: &automerge::ObjId,
    heads: &[automerge::ChangeHash],
) -> Result<(), automerge::AutomergeError> {
    use automerge::ObjType;

    match value {
        automerge::Value::Object(ObjType::Text) => {
            let new_id = tx.insert_object(parent, index, ObjType::Text)?;
            copy_text_spans(tx, &new_id, source_id, heads)?;
        }
        automerge::Value::Object(ObjType::Map) => {
            let new_id = tx.insert_object(parent, index, ObjType::Map)?;
            let children = collect_children_map(tx, source_id, heads);
            for (child_key, child_val, child_src) in &children {
                put_value_into_map(tx, &new_id, child_key, child_val, child_src, heads)?;
            }
        }
        automerge::Value::Object(ObjType::List) => {
            let new_id = tx.insert_object(parent, index, ObjType::List)?;
            let children = collect_children_list(tx, source_id, heads);
            for (i, (child_val, child_src)) in children.iter().enumerate() {
                insert_value_into_list_from_doc(tx, &new_id, i, child_val, child_src, heads)?;
            }
        }
        automerge::Value::Object(obj_type) => {
            tx.insert_object(parent, index, *obj_type)?;
        }
        automerge::Value::Scalar(s) => {
            tx.insert(parent, index, s.as_ref().clone())?;
        }
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
