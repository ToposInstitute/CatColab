//! Rich-text values.
//!
//! Live Automerge documents materialize `Text` as strings, while our
//! JSON serialization emits lossless spans.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tsify::Tsify;

/// Rich text in either its live/legacy string form or serialized spans form.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[serde(untagged)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum RichTextContent {
    String(String),
    Spans(Vec<RichTextSpan>),
}

impl From<String> for RichTextContent {
    fn from(value: String) -> Self {
        RichTextContent::String(value)
    }
}

/// A single span of serialized rich-text content.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "type")]
#[tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)]
pub enum RichTextSpan {
    #[serde(rename = "text")]
    Text {
        value: String,
        #[serde(default, skip_serializing_if = "HashMap::is_empty")]
        marks: HashMap<String, Value>,
    },
    #[serde(rename = "block")]
    Block { block: HashMap<String, Value> },
}

impl RichTextSpan {
    pub fn text(value: impl Into<String>) -> Self {
        RichTextSpan::Text {
            value: value.into(),
            marks: HashMap::new(),
        }
    }
}

#[cfg(feature = "property-tests")]
pub(crate) mod arbitrary {
    use super::*;
    use proptest::prelude::*;
    use serde_json::json;

    fn arb_text_run() -> BoxedStrategy<RichTextSpan> {
        ("[a-zA-Z0-9 ]{1,20}", any::<bool>())
            .prop_map(|(text, bold)| {
                if bold {
                    RichTextSpan::Text {
                        value: text,
                        marks: HashMap::from([("strong".to_string(), json!(true))]),
                    }
                } else {
                    RichTextSpan::text(text)
                }
            })
            .boxed()
    }

    fn arb_math_block() -> BoxedStrategy<RichTextSpan> {
        "[a-zA-Z0-9^ ]{0,20}"
            .prop_map(|tex| RichTextSpan::Block {
                block: HashMap::from([
                    ("type".to_string(), json!("math_inline")),
                    ("tex".to_string(), json!(tex)),
                ]),
            })
            .boxed()
    }

    pub fn arb_rich_text() -> BoxedStrategy<RichTextContent> {
        prop::collection::vec((arb_text_run(), arb_math_block()), 0..4)
            .prop_flat_map(|pairs| {
                proptest::option::of(arb_text_run()).prop_map(move |trailing| {
                    let mut spans = Vec::new();
                    for (text, block) in &pairs {
                        spans.push(text.clone());
                        spans.push(block.clone());
                    }
                    if let Some(text) = trailing {
                        spans.push(text);
                    }
                    RichTextContent::Spans(spans)
                })
            })
            .boxed()
    }
}
