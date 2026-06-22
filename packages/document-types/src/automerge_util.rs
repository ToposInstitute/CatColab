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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::common_test::{doc_from_json, doc_to_json};
    use automerge::{Automerge, ObjType, ReadDoc};
    use serde_json::json;

    #[test]
    fn copy_restores_scalar_fields() {
        let mut doc = doc_from_json(&json!({
            "name": "alice",
            "age": 30,
            "active": true
        }));
        let heads_v1 = doc.get_heads();

        // Mutate the doc to a different state.
        doc.transact(|tx| {
            let name_id = tx.put_object(automerge::ROOT, "name", ObjType::Text)?;
            tx.splice_text(&name_id, 0, 0, "bob")?;
            tx.put(automerge::ROOT, "age", 99_i64)?;
            tx.put(automerge::ROOT, "active", false)?;
            Ok::<_, automerge::AutomergeError>(())
        })
        .unwrap();

        // Restore to v1.
        doc.transact(|tx| {
            copy_doc_at_heads(tx, &heads_v1)?;
            Ok::<_, automerge::AutomergeError>(())
        })
        .unwrap();

        let result = doc_to_json(&doc);
        assert_eq!(result["name"], "alice");
        assert_eq!(result["age"], 30);
        assert_eq!(result["active"], true);
    }

    #[test]
    fn copy_restores_nested_maps() {
        let mut doc = doc_from_json(&json!({
            "config": {
                "theme": "dark",
                "settings": {
                    "fontSize": 14
                }
            }
        }));
        let heads_v1 = doc.get_heads();

        // Overwrite with different nested structure.
        doc.transact(|tx| {
            tx.delete(automerge::ROOT, "config")?;
            let config = tx.put_object(automerge::ROOT, "config", ObjType::Map)?;
            let theme = tx.put_object(&config, "theme", ObjType::Text)?;
            tx.splice_text(&theme, 0, 0, "light")?;
            Ok::<_, automerge::AutomergeError>(())
        })
        .unwrap();

        doc.transact(|tx| {
            copy_doc_at_heads(tx, &heads_v1)?;
            Ok::<_, automerge::AutomergeError>(())
        })
        .unwrap();

        let result = doc_to_json(&doc);
        assert_eq!(result["config"]["theme"], "dark");
        assert_eq!(result["config"]["settings"]["fontSize"], 14);
    }

    #[test]
    fn copy_restores_lists() {
        let mut doc = doc_from_json(&json!({
            "items": ["a", "b", "c"]
        }));
        let heads_v1 = doc.get_heads();

        // Replace with different list.
        doc.transact(|tx| {
            tx.delete(automerge::ROOT, "items")?;
            let list = tx.put_object(automerge::ROOT, "items", ObjType::List)?;
            let x = tx.insert_object(&list, 0, ObjType::Text)?;
            tx.splice_text(&x, 0, 0, "x")?;
            Ok::<_, automerge::AutomergeError>(())
        })
        .unwrap();

        doc.transact(|tx| {
            copy_doc_at_heads(tx, &heads_v1)?;
            Ok::<_, automerge::AutomergeError>(())
        })
        .unwrap();

        let result = doc_to_json(&doc);
        let items: Vec<&str> = result["items"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        assert_eq!(items, vec!["a", "b", "c"]);
    }

    #[test]
    fn copy_removes_keys_not_in_target() {
        let mut doc = doc_from_json(&json!({
            "keep": "yes"
        }));
        let heads_v1 = doc.get_heads();

        // Add extra keys.
        doc.transact(|tx| {
            let extra = tx.put_object(automerge::ROOT, "extra", ObjType::Text)?;
            tx.splice_text(&extra, 0, 0, "should be gone")?;
            tx.put(automerge::ROOT, "another", 42_i64)?;
            Ok::<_, automerge::AutomergeError>(())
        })
        .unwrap();

        doc.transact(|tx| {
            copy_doc_at_heads(tx, &heads_v1)?;
            Ok::<_, automerge::AutomergeError>(())
        })
        .unwrap();

        let result = doc_to_json(&doc);
        assert_eq!(result["keep"], "yes");
        assert!(result.get("extra").is_none());
        assert!(result.get("another").is_none());
    }

    #[test]
    fn copy_preserves_rich_text_marks() {
        let mut doc = Automerge::new();

        // Create text with a bold mark.
        doc.transact(|tx| {
            let text_id = tx.put_object(automerge::ROOT, "content", ObjType::Text)?;
            tx.splice_text(&text_id, 0, 0, "hello world")?;
            tx.mark(
                &text_id,
                automerge::marks::Mark::new("bold".into(), true, 0, 5),
                automerge::marks::ExpandMark::After,
            )?;
            Ok::<_, automerge::AutomergeError>(())
        })
        .unwrap();
        let heads_with_mark = doc.get_heads();

        // Overwrite with plain text.
        doc.transact(|tx| {
            tx.delete(automerge::ROOT, "content")?;
            let text_id = tx.put_object(automerge::ROOT, "content", ObjType::Text)?;
            tx.splice_text(&text_id, 0, 0, "replaced")?;
            Ok::<_, automerge::AutomergeError>(())
        })
        .unwrap();

        // Restore.
        doc.transact(|tx| {
            copy_doc_at_heads(tx, &heads_with_mark)?;
            Ok::<_, automerge::AutomergeError>(())
        })
        .unwrap();

        // Verify text content.
        let result = doc_to_json(&doc);
        assert_eq!(result["content"], "hello world");

        // Verify mark was preserved.
        let (_, content_id) = doc.get(automerge::ROOT, "content").unwrap().unwrap();
        let marks = doc.marks(&content_id).unwrap();
        assert!(!marks.is_empty(), "bold mark should be preserved");
        assert_eq!(marks[0].name(), "bold");
        assert_eq!(marks[0].start, 0);
        assert_eq!(marks[0].end, 5);
    }

    #[test]
    fn copy_works_on_empty_doc() {
        let mut doc = Automerge::new();
        let heads_empty = doc.get_heads();

        // Add some data.
        doc.transact(|tx| {
            tx.put(automerge::ROOT, "key", 1_i64)?;
            Ok::<_, automerge::AutomergeError>(())
        })
        .unwrap();

        // Restore to empty.
        doc.transact(|tx| {
            copy_doc_at_heads(tx, &heads_empty)?;
            Ok::<_, automerge::AutomergeError>(())
        })
        .unwrap();

        let keys: Vec<String> = doc.keys(automerge::ROOT).collect();
        assert!(keys.is_empty());
    }
}

#[cfg(all(test, feature = "property-tests"))]
mod property_tests {
    use super::*;
    use crate::common_test::{doc_from_json, doc_to_json};
    use crate::v1::notebook::ModelNotebook;
    use automerge::ReadDoc;
    use test_strategy::proptest;

    /// After mutating a doc and then restoring via `copy_doc_at_heads`, the
    /// JSON representation matches the original.
    #[proptest(cases = 64)]
    fn copy_doc_at_heads_restores_model_notebook(notebook: ModelNotebook) {
        let json = serde_json::to_value(&notebook.0).expect("serialize to JSON");
        let mut doc = doc_from_json(&json);
        let original_heads = doc.get_heads();

        // Mutate: clear all keys from root.
        doc.transact(|tx| {
            let keys: Vec<String> = tx.keys(automerge::ROOT).collect();
            for key in keys {
                tx.delete(automerge::ROOT, key.as_str())?;
            }
            Ok::<_, automerge::AutomergeError>(())
        })
        .unwrap();

        // Restore to original heads.
        doc.transact(|tx| {
            copy_doc_at_heads(tx, &original_heads)?;
            Ok::<_, automerge::AutomergeError>(())
        })
        .unwrap();

        let result = doc_to_json(&doc);
        proptest::prop_assert_eq!(json, result);
    }

    /// Restoring to empty heads after populating yields an empty document.
    #[proptest(cases = 64)]
    fn copy_doc_at_heads_restores_to_empty(notebook: ModelNotebook) {
        let json = serde_json::to_value(&notebook.0).expect("serialize to JSON");
        let mut doc = automerge::Automerge::new();
        let empty_heads = doc.get_heads();

        // Populate the doc.
        doc.transact(|tx| {
            crate::automerge_json::populate_automerge_from_json(tx, automerge::ROOT, &json)
                .unwrap();
            Ok::<_, automerge::AutomergeError>(())
        })
        .unwrap();

        // Restore to empty.
        doc.transact(|tx| {
            copy_doc_at_heads(tx, &empty_heads)?;
            Ok::<_, automerge::AutomergeError>(())
        })
        .unwrap();

        let keys: Vec<String> = doc.keys(automerge::ROOT).collect();
        proptest::prop_assert!(
            keys.is_empty(),
            "doc should be empty after restoring to empty heads"
        );
    }
}
