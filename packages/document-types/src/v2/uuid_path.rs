use serde::{Deserialize, Deserializer, Serialize, Serializer, de};
use std::str::FromStr;
use tsify::Tsify;
use uuid::Uuid;

/// A path of UUIDs for identifying formal content in a model, including formal content from
/// instantiations in that model. This is seralized as a string of dot-separated UUIDs.
#[derive(PartialEq, Eq, Hash, Clone, Debug, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi, type = "string")]
pub struct UuidPath(pub Vec<Uuid>);

impl Serialize for UuidPath {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let joined = self.0.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(".");
        serializer.serialize_str(&joined)
    }
}

impl<'de> Deserialize<'de> for UuidPath {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        if s.is_empty() {
            return Err(de::Error::custom("row key must contain at least one UUID"));
        }
        let ids = s
            .split('.')
            .map(Uuid::from_str)
            .collect::<Result<Vec<_>, _>>()
            .map_err(de::Error::custom)?;
        Ok(UuidPath(ids))
    }
}
