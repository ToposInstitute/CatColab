/*! Qualified names for elements of families of sets.

A [qualified name](QualifiedName) is a sequence of [name segments](NameSegment).
For example, a qualified name with three segments can be constructed as

```
# use catlog::zero::qualified_name::*;
let name: QualifiedName = ["foo", "bar", "baz"].map(NameSegment::from).into();
assert_eq!(name.to_string(), "foo.bar.baz");
```
 */

use std::{fmt::Display, hash::Hash};

use derive_more::From;
use itertools::Itertools;
use ustr::Ustr;
use uuid::Uuid;

#[cfg(feature = "serde")]
use serde::{self, Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

/** A segment in a [qualified name](QualifiedName).

A segment is either a meaningless, machine-generated identifier, represented as
a [UUID](Uuid), or a meaningful, typically human-generated name, represented as
an interned string.
 */
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, From)]
pub enum NameSegment {
    /// A universally unique identifier (UUID).
    Uuid(Uuid),

    /// A human-readable name, assumed unique within the relevant context.
    Name(Ustr),
}

impl From<&str> for NameSegment {
    fn from(name: &str) -> Self {
        Self::Name(name.into())
    }
}

impl Display for NameSegment {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Uuid(uiid) => write!(f, "{}", uiid.as_braced()),
            Self::Name(name) => {
                if name.contains(char::is_whitespace) {
                    write!(f, "`{name}`")
                } else {
                    write!(f, "{name}")
                }
            }
        }
    }
}

impl NameSegment {
    /// Serializes the segment into a string.
    pub fn serialize_string(&self) -> String {
        match self {
            Self::Uuid(uiid) => uiid.to_string(),
            Self::Name(name) => format!("`{name}`"),
        }
    }

    /// Deserializes a segment from a string.
    pub fn deserialize_str(input: &str) -> Result<Self, String> {
        let mut chars = input.chars();
        if chars.next() == Some('`') && chars.next_back() == Some('`') {
            Ok(Self::Name(chars.as_str().into()))
        } else {
            let uuid = Uuid::parse_str(input).map_err(|err| format!("Invalid UUID: {err}"))?;
            Ok(Self::Uuid(uuid))
        }
    }
}

/** A fully qualified name, consisting of a sequence of [segments](NameSegment).

A qualified name is a sequence of segments that unambiguously names an element
in a set, or a family of sets, or a family of family of sets, and so on.

# Data structure

At this time, a qualified name is stored simply as a vector of name segments.
Various optimizations could be considered, such as an `Rc<[NameSegment]>` or,
since qualified names tend to have only a few segments, a
`SmallVec<[NameSegment; n]>` for some choice of `n`. These will be considered
premature optimizations until there is good evidence in favor of them.

# Serialization

To simplify their use in JavaScript, qualified name are serialized as flat
strings with segments separated by periods. Human-readable names are quoted with
backticks regardless of whether they contain whitespace, which makes parsing
easier. Note that the [display](Display) format is different from the
serialization format.
 */
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, From)]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub struct QualifiedName(
    #[cfg_attr(feature = "serde-wasm", tsify(type = "string"))] Vec<NameSegment>,
);

/** Helper function to construct a qualified name.

This function is intended for writing examples and tests.
 */
pub fn name(x: impl Into<QualifiedName>) -> QualifiedName {
    x.into()
}

impl<const N: usize> From<[NameSegment; N]> for QualifiedName {
    fn from(value: [NameSegment; N]) -> Self {
        Vec::from(value).into()
    }
}

impl From<Uuid> for QualifiedName {
    fn from(id: Uuid) -> Self {
        Self::single(id.into())
    }
}

impl From<Ustr> for QualifiedName {
    fn from(name: Ustr) -> Self {
        Self::single(name.into())
    }
}

impl From<&str> for QualifiedName {
    fn from(name: &str) -> Self {
        Self::single(name.into())
    }
}

impl Display for QualifiedName {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        for (i, segment) in self.0.iter().enumerate() {
            if i > 0 {
                write!(f, ".")?;
            }
            write!(f, "{segment}")?;
        }
        Ok(())
    }
}

#[cfg(feature = "serde")]
impl Serialize for QualifiedName {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.serialize_string().as_str())
    }
}

#[cfg(feature = "serde")]
impl<'de> Deserialize<'de> for QualifiedName {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_str(QualifiedNameVisitor)
    }
}

#[cfg(feature = "serde")]
struct QualifiedNameVisitor;

#[cfg(feature = "serde")]
impl<'de> serde::de::Visitor<'de> for QualifiedNameVisitor {
    type Value = QualifiedName;

    fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(formatter, "a qualified name as a dot-separated string")
    }

    fn visit_str<E>(self, input: &str) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        QualifiedName::deserialize_str(input).map_err(E::custom)
    }
}

impl QualifiedName {
    /// Constructs a qualified name with a single segment.
    pub fn single(id: NameSegment) -> Self {
        Self(vec![id])
    }

    /// Gets the segment from a qualified name with only one segment.
    pub fn only(&self) -> Option<NameSegment> {
        if self.0.len() == 1 {
            Some(self.0[0])
        } else {
            None
        }
    }

    /// Serializes the qualified name into a string.
    pub fn serialize_string(&self) -> String {
        self.0.iter().map(|segment| segment.serialize_string()).join(".")
    }

    /// Deserializes a qualified name from a string.
    pub fn deserialize_str(input: &str) -> Result<Self, String> {
        let segments: Result<Vec<_>, _> =
            input.split(".").map(NameSegment::deserialize_str).collect();
        Ok(segments?.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::uuid;

    const A_UUID: Uuid = uuid!("67e55044-10b1-426f-9247-bb680e5fe0c8");

    #[test]
    fn display_name() {
        let string = QualifiedName::from(A_UUID).to_string();
        assert_eq!(string.chars().next(), Some('{'));
        assert_eq!(string.chars().next_back(), Some('}'));

        assert_eq!(QualifiedName::from("foo").to_string(), "foo");
        assert_eq!(QualifiedName::from("foo bar").to_string(), "`foo bar`");
    }

    #[test]
    fn serialize_name() {
        let name: QualifiedName = A_UUID.into();
        let serialized = name.serialize_string();
        assert_eq!(serialized.chars().next_tuple(), Some(('6', '7', 'e')));
        assert_eq!(QualifiedName::deserialize_str(&serialized), Ok(name));

        let name: QualifiedName = ["foo", "bar", "baz"].map(NameSegment::from).into();
        let serialized = name.serialize_string();
        assert_eq!(serialized, "`foo`.`bar`.`baz`");
        assert_eq!(QualifiedName::deserialize_str(&serialized), Ok(name));
    }
}
