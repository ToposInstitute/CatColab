//! Qualified names and labels.

use std::fmt::Display;
use std::{collections::HashMap, hash::Hash};

use derive_more::From;
use itertools::Itertools;
use ustr::Ustr;
use uuid::Uuid;

#[cfg(feature = "serde")]
use serde::{self, Deserialize, Serialize};
#[cfg(feature = "serde-wasm")]
use tsify::Tsify;

use super::column::{Column, IndexedHashColumn, Mapping, MutMapping};
use crate::tt::util::pretty::*;

/// A segment in a [qualified name](QualifiedName).
///
/// A segment is either a meaningless, machine-generated identifier, represented as
/// a [UUID](Uuid), or a meaningful, operator-generated name, represented as an
/// interned string.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, From)]
pub enum NameSegment {
    /// A universally unique identifier (UUID).
    Uuid(Uuid),

    /// A human-readable name, assumed unique within the relevant context.
    Text(Ustr),
}

impl From<&str> for NameSegment {
    fn from(name: &str) -> Self {
        Self::Text(name.into())
    }
}

impl Display for NameSegment {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Uuid(uiid) => uiid.as_braced().fmt(f),
            Self::Text(name) => name.fmt(f),
        }
    }
}

/// Shorthand for constructing a label segment from something that can convert
/// into a Ustr.
pub fn name_seg(s: impl Into<Ustr>) -> NameSegment {
    NameSegment::Text(s.into())
}

impl NameSegment {
    /// Serializes the segment into a string.
    pub fn serialize_string(&self) -> String {
        match self {
            Self::Uuid(uiid) => uiid.to_string(),
            Self::Text(name) => format!("`{name}`"),
        }
    }

    /// Deserializes a segment from a string.
    pub fn deserialize_str(input: &str) -> Result<Self, String> {
        let mut chars = input.chars();
        if chars.next() == Some('`') && chars.next_back() == Some('`') {
            Ok(Self::Text(chars.as_str().into()))
        } else {
            let uuid = Uuid::parse_str(input).map_err(|err| format!("Invalid UUID: {err}"))?;
            Ok(Self::Uuid(uuid))
        }
    }
}

/// A qualified name, consisting of a sequence of [name segments](NameSegment).
///
/// A qualified name is a sequence of segments that unambiguously names an element
/// in a set, or a family of sets, or a family of family of sets, and so on. For
/// example, a qualified name with three segments can be constructed as
///
/// ```
/// # use catlog::zero::qualified::*;
/// let name: QualifiedName = ["foo", "bar", "baz"].map(NameSegment::from).into();
/// assert_eq!(name.to_string(), "foo.bar.baz");
/// ```
///
/// # Data structure
///
/// At this time, a qualified name is stored simply as a vector of name segments.
/// Various optimizations could be considered, such as an `Rc<[NameSegment]>` or,
/// since qualified names tend to have only a few segments, a
/// `SmallVec<[NameSegment; n]>` for some choice of `n`. These will be considered
/// premature optimizations until there is good evidence in favor of them.
///
/// # Serialization
///
/// To simplify their use in JavaScript, qualified name are serialized as flat
/// strings with segments separated by periods. Human-readable names are quoted with
/// backticks regardless of whether they contain whitespace, which makes parsing
/// easier. Note that the [display](Display) format is different from the
/// serialization format.
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, From)]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub struct QualifiedName(
    #[cfg_attr(feature = "serde-wasm", tsify(type = "string"))] Vec<NameSegment>,
);

/// Helper function to construct a qualified name.
pub fn name(x: impl Into<QualifiedName>) -> QualifiedName {
    x.into()
}

impl<const N: usize> From<[NameSegment; N]> for QualifiedName {
    fn from(segments: [NameSegment; N]) -> Self {
        Vec::from(segments).into()
    }
}

impl<const N: usize> From<[Uuid; N]> for QualifiedName {
    fn from(segments: [Uuid; N]) -> Self {
        segments.map(NameSegment::Uuid).into()
    }
}

impl<const N: usize> From<[&str; N]> for QualifiedName {
    fn from(segments: [&str; N]) -> Self {
        segments.map(NameSegment::from).into()
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

impl ToDoc for QualifiedName {
    fn to_doc<'a>(&self) -> D<'a> {
        t(format!("{self}"))
    }
}

impl Display for QualifiedName {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        fmt_qualified(
            f,
            &self.0,
            |segment| matches!(segment, NameSegment::Text(name) if name.contains(char::is_whitespace)),
        )
    }
}

fn fmt_qualified<T: Display>(
    f: &mut std::fmt::Formatter<'_>,
    segments: &[T],
    mut show_quotes: impl FnMut(&T) -> bool,
) -> std::fmt::Result {
    let n = segments.len();
    for (i, segment) in segments.iter().enumerate() {
        if i > 0 {
            write!(f, ".")?;
        }
        let quote = n > 1 && show_quotes(segment);
        if quote {
            write!(f, "`")?;
        }
        write!(f, "{segment}")?;
        if quote {
            write!(f, "`")?;
        }
    }
    Ok(())
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
    pub fn single(segment: NameSegment) -> Self {
        Self(vec![segment])
    }

    /// Extracts a slice containing the name segments.
    pub fn as_slice(&self) -> &[NameSegment] {
        self.0.as_slice()
    }

    /// Iterates over the segments of the qualified name.
    pub fn segments(&self) -> impl Iterator<Item = &NameSegment> {
        self.0.iter()
    }

    /// Gets the segment from a qualified name with only one segment.
    pub fn only(&self) -> Option<NameSegment> {
        if self.0.len() == 1 {
            Some(self.0[0])
        } else {
            None
        }
    }

    /// Add another segment onto the end.
    pub fn snoc(&self, segment: NameSegment) -> Self {
        let mut segments = self.0.clone();
        segments.push(segment);
        Self(segments)
    }

    /// Serializes the qualified name into a string.
    pub fn serialize_string(&self) -> String {
        self.segments().map(|segment| segment.serialize_string()).join(".")
    }

    /// Deserializes a qualified name from a string.
    pub fn deserialize_str(input: &str) -> Result<Self, String> {
        let segments: Result<Vec<_>, _> =
            input.split(".").map(NameSegment::deserialize_str).collect();
        Ok(segments?.into())
    }
}

/// A segment in a [qualified label](QualifiedLabel).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, From)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(untagged))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub enum LabelSegment {
    /// Textual label for a named entity.
    Text(Ustr),

    /// Integer index representing an anonymous entity.
    Index(usize),
}

/// Shorthand for constructing a label segment from something that can convert
/// into a Ustr.
pub fn label_seg(s: impl Into<Ustr>) -> LabelSegment {
    LabelSegment::Text(s.into())
}

impl From<&str> for LabelSegment {
    fn from(label: &str) -> Self {
        Self::Text(label.into())
    }
}

impl Display for LabelSegment {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Text(label) => label.fmt(f),
            Self::Index(index) => index.fmt(f),
        }
    }
}

/// A qualified label, consisting of a sequence of [label segments](LabelSegment).
#[derive(Clone, Debug, PartialEq, Eq, From)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub struct QualifiedLabel(Vec<LabelSegment>);

/// Helper function to construct a qualified label.
pub fn label(x: impl Into<QualifiedLabel>) -> QualifiedLabel {
    x.into()
}

impl<const N: usize> From<[LabelSegment; N]> for QualifiedLabel {
    fn from(segments: [LabelSegment; N]) -> Self {
        Vec::from(segments).into()
    }
}

impl<const N: usize> From<[&str; N]> for QualifiedLabel {
    fn from(segments: [&str; N]) -> Self {
        segments.map(LabelSegment::from).into()
    }
}

impl From<Ustr> for QualifiedLabel {
    fn from(label: Ustr) -> Self {
        Self::single(label.into())
    }
}

impl From<&str> for QualifiedLabel {
    fn from(label: &str) -> Self {
        Self::single(label.into())
    }
}

impl From<usize> for QualifiedLabel {
    fn from(value: usize) -> Self {
        Self::single(value.into())
    }
}

impl ToDoc for QualifiedLabel {
    fn to_doc<'a>(&self) -> D<'a> {
        t(format!("{self}"))
    }
}

impl Display for QualifiedLabel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        fmt_qualified(
            f,
            &self.0,
            |segment| matches!(segment, LabelSegment::Text(label) if label.contains(char::is_whitespace)),
        )
    }
}

impl QualifiedLabel {
    /// Constructs a qualified label with a single segment.
    pub fn single(segment: LabelSegment) -> Self {
        Self(vec![segment])
    }

    /// Iterates over the segments of the qualified label.
    pub fn segments(&self) -> impl Iterator<Item = &LabelSegment> {
        self.0.iter()
    }

    /// Add another segment onto the end
    pub fn snoc(&self, segment: LabelSegment) -> Self {
        let mut segments = self.0.clone();
        segments.push(segment);
        Self(segments)
    }
}

/// A namespace in which to resolve qualified labels as qualified names.
#[derive(Clone, Debug)]
pub struct Namespace {
    inner: HashMap<NameSegment, Namespace>,
    uuid_labels: Option<IndexedHashColumn<Uuid, LabelSegment>>,
}

/// The result of looking up a qualified name by qualified label.
#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(tag = "tag", content = "content"))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(feature = "serde-wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub enum NameLookup {
    /// A unique name with the given label exists.
    Unique(QualifiedName),

    /// Multiple names with the given label exist, with arbitrary one returned.
    Arbitrary(QualifiedName),

    /// No name with the given label exists.
    None,
}

impl Namespace {
    /// Creates an empty namespace for text segments.
    pub fn new_for_text() -> Self {
        Self {
            inner: Default::default(),
            uuid_labels: None,
        }
    }

    /// Creates an empty namespace for UUID segments.
    pub fn new_for_uuid() -> Self {
        Self {
            inner: Default::default(),
            uuid_labels: Some(Default::default()),
        }
    }

    /// Adds a new inner namespace.
    pub fn add_inner(&mut self, name: NameSegment, inner: Self) {
        assert!(
            self.inner.insert(name, inner).is_none(),
            "Inner namespace already exists for segment: {name}"
        );
    }

    /// Sets the label segment associated with a UUID.
    pub fn set_label(&mut self, uuid: Uuid, label: LabelSegment) {
        self.uuid_labels.as_mut().expect("Should be a UUID namespace").set(uuid, label);
    }

    /// Tries to get a human-readable label for a name.
    pub fn label(&self, name: &QualifiedName) -> Option<QualifiedLabel> {
        let mut namespace = Some(self);
        let labels: Option<Vec<_>> = name
            .segments()
            .map(|segment| {
                let maybe_label = match segment {
                    NameSegment::Uuid(uuid) => namespace
                        .and_then(|ns| ns.uuid_labels.as_ref())
                        .and_then(|ul| ul.apply_to_ref(uuid)),
                    NameSegment::Text(name) => Some(LabelSegment::Text(*name)),
                };
                namespace = namespace.and_then(|ns| ns.inner.get(segment));
                maybe_label
            })
            .collect();
        Some(labels?.into())
    }

    /// Gets a human-readable string label for a name.
    ///
    /// Unlike [`label`](Self::label), this method is infallible: UUIDs without
    /// a corresponding label are just displayed directly. That makes this
    /// method suitable for debugging and text dumps but not for situations when
    /// a user should never see a UUID.
    pub fn label_string(&self, name: &QualifiedName) -> String {
        let mut namespace = Some(self);
        let labels = name.segments().map(|segment| {
            let label = match segment {
                NameSegment::Uuid(uuid) => namespace
                    .and_then(|ns| ns.uuid_labels.as_ref())
                    .and_then(|ul| ul.apply_to_ref(uuid))
                    .unwrap_or_else(|| LabelSegment::Text(uuid.braced().to_string().into())),
                NameSegment::Text(name) => LabelSegment::Text(*name),
            };
            namespace = namespace.and_then(|ns| ns.inner.get(segment));
            label
        });
        QualifiedLabel(labels.collect()).to_string()
    }

    /// Tries to get a name corresponding to a label.
    pub fn name_with_label(&self, label: &QualifiedLabel) -> NameLookup {
        let mut namespace = Some(self);
        let mut ambiguous = false;
        let names: Option<Vec<_>> = label
            .segments()
            .map(|segment| {
                let maybe_uuid_labels = namespace.and_then(|ns| ns.uuid_labels.as_ref());
                let maybe_name = match (maybe_uuid_labels, segment) {
                    (Some(uuid_labels), _) => {
                        let mut uuids = uuid_labels.preimage(segment);
                        let maybe_uuid = uuids.next();
                        if uuids.next().is_some() {
                            ambiguous = true;
                        }
                        maybe_uuid.map(NameSegment::Uuid)
                    }
                    (None, LabelSegment::Text(text)) => Some(NameSegment::Text(*text)),
                    (None, LabelSegment::Index(_)) => None,
                };
                namespace = namespace
                    .and_then(|ns| maybe_name.as_ref().and_then(|name| ns.inner.get(name)));
                maybe_name
            })
            .collect();
        match names {
            Some(names) if !ambiguous => NameLookup::Unique(names.into()),
            Some(names) => NameLookup::Arbitrary(names.into()),
            None => NameLookup::None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::uuid;

    const UUID1: Uuid = uuid!("67e55044-10b1-426f-9247-bb680e5fe0c8");
    const UUID2: Uuid = uuid!("f81d4fae-7dec-11d0-a765-00a0c91e6bf6");

    #[test]
    fn display_name() {
        let string = name(UUID1).to_string();
        assert_eq!(string.chars().next_tuple(), Some(('{', '6', '7', 'e')));
        assert_eq!(string.chars().next_back(), Some('}'));

        assert_eq!(name("foo").to_string(), "foo");
        assert_eq!(name("foo bar").to_string(), "foo bar");
        assert_eq!(name(["foo bar", "baz"]).to_string(), "`foo bar`.baz");
    }

    #[test]
    fn serialize_name() {
        let qual_name = name(UUID1);
        let serialized = qual_name.serialize_string();
        assert_eq!(serialized.chars().next_tuple(), Some(('6', '7', 'e')));
        assert_eq!(QualifiedName::deserialize_str(&serialized), Ok(qual_name));

        let qual_name = name(["foo", "bar", "baz"].map(NameSegment::from));
        let serialized = qual_name.serialize_string();
        assert_eq!(serialized, "`foo`.`bar`.`baz`");
        assert_eq!(QualifiedName::deserialize_str(&serialized), Ok(qual_name));
    }

    #[test]
    fn display_label() {
        assert_eq!(label("foo").to_string(), "foo");
        assert_eq!(label("foo bar").to_string(), "foo bar");
        assert_eq!(label(2).to_string(), "2");

        assert_eq!(label([LabelSegment::from("foo"), LabelSegment::from(1)]).to_string(), "foo.1");
        assert_eq!(label(["foo bar", "baz"]).to_string(), "`foo bar`.baz");
    }

    #[test]
    fn namespaces() {
        let mut child1 = Namespace::new_for_uuid();
        child1.set_label(UUID1, "bar".into());
        child1.set_label(UUID2, "baz".into());
        let mut root = Namespace::new_for_uuid();
        root.add_inner(UUID1.into(), child1);
        root.add_inner(UUID2.into(), Namespace::new_for_text());
        root.set_label(UUID1, "foo".into());
        root.set_label(UUID2, "textual".into());

        let (qual_name, qual_label) = (name([UUID1, UUID2]), label(["foo", "baz"]));
        assert_eq!(root.label(&qual_name), Some(qual_label.clone()));
        assert_eq!(root.label_string(&qual_name), "foo.baz");
        assert_eq!(root.name_with_label(&qual_label), NameLookup::Unique(qual_name));

        let qual_name =
            name([NameSegment::Uuid(UUID1), NameSegment::Uuid(UUID1), NameSegment::from("biz")]);
        let qual_label = label(["foo", "bar", "biz"]);
        assert_eq!(root.label(&qual_name), Some(qual_label.clone()));
        assert_eq!(root.name_with_label(&qual_label), NameLookup::Unique(qual_name));

        let qual_name = name([UUID2, UUID1]);
        assert_eq!(root.label(&qual_name), None);
        assert_eq!(root.label_string(&qual_name), format!("textual.{{{UUID1}}}"));
        assert_eq!(root.name_with_label(&label(["bar", "foo"])), NameLookup::None);

        let mut ambiguous = Namespace::new_for_uuid();
        ambiguous.set_label(UUID1, "foo".into());
        ambiguous.set_label(UUID2, "foo".into());
        assert!(matches!(ambiguous.name_with_label(&label("foo")), NameLookup::Arbitrary(_)));
    }
}
