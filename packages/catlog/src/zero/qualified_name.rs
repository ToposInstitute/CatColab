/*! Qualified names for elements of families of sets.

A [qualified name](QualifiedName) is a sequence of [name segments](NameSegment).
For example, a qualified name with three segments can be constructed as

```
# use catlog::zero::qualified_name::*;
let name = QualifiedName::from(["foo", "bar", "baz"].map(NameSegment::from));
assert_eq!(name.to_string(), "foo.bar.baz");
```
 */

use std::{fmt::Display, hash::Hash};

use derive_more::From;
use ustr::Ustr;
use uuid::Uuid;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

/** A segment in a [qualified name](QualifiedName).

A segment is either a meaningless, machine-generated identifier, represented as
a [UUID](Uuid), or a meaningful, typically human-generated name, represented as
an interned string.
 */
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, From)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(tag = "tag", content = "content"))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
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
            NameSegment::Uuid(id) => write!(f, "{}", id.as_braced()),
            NameSegment::Name(name) => {
                if name.contains(char::is_whitespace) {
                    write!(f, "`{name}`")
                } else {
                    write!(f, "{name}")
                }
            }
        }
    }
}

/** A fully qualified name, consisting of a sequence of [segments](NameSegment).

A qualified name is a sequence of segments that unambiguously names an element
in a set, or a family of sets, or a family of family of sets, and so on.

At this time, a qualified name is stored simply as a vector of name segments.
Various optimizations could be considered, such as an `Rc<[NameSegment]>` or,
since qualified names tend to have only a few segments, a
`SmallVec<[NameSegment; n]>` for some choice of `n`. These will be considered
premature optimizations until there is good evidence in favor of them.
 */
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, From)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub struct QualifiedName(Vec<NameSegment>);

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

impl QualifiedName {
    /// Constructs a qualified name with a single segment.
    pub fn single(id: NameSegment) -> Self {
        Self(vec![id])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::uuid;

    #[test]
    fn display_name() {
        let id = uuid!("67e55044-10b1-426f-9247-bb680e5fe0c8");
        assert_eq!(NameSegment::from(id).to_string().chars().next(), Some('{'));

        assert_eq!(NameSegment::from("foo").to_string(), "foo");
        assert_eq!(NameSegment::from("foo bar").to_string(), "`foo bar`");
    }
}
