//! Rows.

use derive_more::From;
use std::ops::Index;

use crate::{tt::prelude::*, zero::LabelSegment};

/// An insertion-ordered map from `FieldName` to `T`.
///
/// Also stores a "label" for each entry, which may not be the same as the
/// FieldName in the case that the FieldName is a UUID.
///
/// This is called "row" because it's a short name, and it corresponds to the idea
/// of a row in a database, which is a map from fields to values.
///
/// Create this using the [FromIterator] implementation.
#[derive(Clone, PartialEq, Eq, From)]
pub struct Row<T>(IndexMap<FieldName, (LabelSegment, T)>);

impl<T> Index<FieldName> for Row<T> {
    type Output = T;
    fn index(&self, index: FieldName) -> &Self::Output {
        self.get(index).unwrap()
    }
}

impl<T> Row<T> {
    /// Lookup the field `name` if it exists.
    ///
    /// Also see the [Index] implementation, which just `unwrap`s this.
    pub fn get(&self, name: FieldName) -> Option<&T> {
        self.0.get(&name).map(|p| &p.1)
    }

    /// Lookup the field `name` if it exists, and get its value and label.
    pub fn get_with_label(&self, name: FieldName) -> Option<&(LabelSegment, T)> {
        self.0.get(&name)
    }

    /// Iterate through the fields in insertion order.
    pub fn iter(&self) -> impl Iterator<Item = (&FieldName, &(LabelSegment, T))> {
        self.0.iter()
    }

    /// Return the number of fields.
    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// Return whether the row is empty (Clippy wants this).
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Return whether the row contains the given field.
    pub fn has(&self, field_name: FieldName) -> bool {
        self.0.contains_key(&field_name)
    }

    /// Construct the empty row.
    pub fn empty() -> Self {
        Self(IndexMap::new())
    }

    /// Map a function to produce a new row.
    pub fn map<S>(&self, f: impl Fn(&T) -> S) -> Row<S> {
        self.iter().map(|(name, (label, x))| (*name, (*label, f(x)))).collect()
    }

    ///  Insert a new field.
    pub fn insert(&mut self, field: FieldName, label: LabelSegment, value: T) {
        self.0.insert(field, (label, value));
    }
}

impl<T> FromIterator<(FieldName, (LabelSegment, T))> for Row<T> {
    fn from_iter<I>(iter: I) -> Self
    where
        I: IntoIterator<Item = (FieldName, (LabelSegment, T))>,
    {
        Row(iter.into_iter().collect())
    }
}
