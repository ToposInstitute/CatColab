/*! Qualified names for elements of families of sets.

A [qualified name](QualifiedName) is a sequence of [name segments](NameSegment).
For example, the qualified name displayed as `foo.bar.baz`, consisting of three
segments, can be constructed as

```
# use catlog::zero::qualified_name::*;
let name = QualifiedName::from(["foo", "bar", "baz"].map(NameSegment::from));
```
 */

use std::hash::Hash;

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
    /** A universally unique identifier (UUID).

    The UUID is optionally supplemented with a human-readable name, to aid with
    debugging and writing error messages. The name is allowed to be ambiguous
    and should never be used for lookup.
     */
    Uuid {
        /// The UUID.
        id: Uuid,
        /// An optional human-readable name.
        name: Option<Ustr>,
    },

    /** A human-readable name.

    The name is assumed to be unique within the relevant context, hence to
    unambiguously name something in that context.
     */
    #[from]
    Name(Ustr),
}

impl From<Uuid> for NameSegment {
    fn from(id: Uuid) -> Self {
        Self::Uuid { id, name: None }
    }
}

impl From<&str> for NameSegment {
    fn from(name: &str) -> Self {
        Ustr::from(name).into()
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

impl QualifiedName {
    /// Constructs a qualified name with a single segment.
    pub fn single(id: NameSegment) -> Self {
        Self(vec![id])
    }
}
