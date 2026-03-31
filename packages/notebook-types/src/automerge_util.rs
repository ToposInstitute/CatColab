//! Utilities for copying Automerge document state between heads.

use automerge::transaction::Transactable;

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
            tx.get_at(source_id, i, heads).ok().flatten().map(|(v, id)| (v.to_owned(), id))
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
    tx.update_spans(new_id, automerge::marks::UpdateSpansConfig::default(), spans)
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
