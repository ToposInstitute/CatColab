use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_wasm_bindgen::{from_value, to_value};
use wasm_bindgen::prelude::*;

mod v0;
pub mod v1;

#[cfg(test)]
mod test_utils;

pub mod current {
    // this should always track the latest version, and is the only version
    // that is exported from notebook-types
    pub use crate::v1::*;
}

#[derive(Serialize, Debug)]
pub enum VersionedDocument {
    V0(v0::Document),
    V1(v1::Document),
}

pub static CURRENT_VERSION: u32 = 1;

#[wasm_bindgen(js_name = "currentVersion")]
pub fn current_version() -> u32 {
    CURRENT_VERSION
}

impl<'de> Deserialize<'de> for VersionedDocument {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = Value::deserialize(deserializer)?;

        let version = value.get("version").and_then(Value::as_u64).unwrap_or(0);

        match version {
            0 => {
                let doc: v0::Document =
                    serde_json::from_value(value).map_err(serde::de::Error::custom)?;
                Ok(VersionedDocument::V0(doc))
            }
            1 => {
                let doc: v1::Document =
                    serde_json::from_value(value).map_err(serde::de::Error::custom)?;
                Ok(VersionedDocument::V1(doc))
            }
            other => Err(serde::de::Error::custom(format!("unsupported version {other}"))),
        }
    }
}

impl VersionedDocument {
    pub fn to_current(self) -> current::Document {
        match self {
            VersionedDocument::V0(v0) => {
                // Recursive call to VersionedNotebook::to_current
                VersionedDocument::V1(v1::Document::migrate_from_v0(v0)).to_current()
            }

            VersionedDocument::V1(old1) => old1,
        }
    }
}

#[wasm_bindgen(js_name = "migrateDocument")]
pub fn migrate_document(input: JsValue) -> Result<JsValue, JsValue> {
    let doc: VersionedDocument =
        from_value(input).map_err(|e| JsValue::from_str(&format!("deserialize error: {e}")))?;

    let current_doc = doc.to_current();

    to_value(&current_doc).map_err(|e| JsValue::from_str(&format!("serialize error: {e}")))
}

#[cfg(test)]
mod migration_tests {
    use super::VersionedDocument;
    use crate::test_utils::test_example_documents;

    #[test]
    fn test_v0_examples_migrate_to_current() {
        test_example_documents::<VersionedDocument, _>("examples/v0", |doc, _| {
            // ensure it migrates without panic
            let _ = doc.to_current();
        });
    }
}
