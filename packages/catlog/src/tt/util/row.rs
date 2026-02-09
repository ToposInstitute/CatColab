//! Rows.
use crate::{tt::prelude::*, zero::LabelSegment};
use std::ops::Index;

/// A cheaply cloneable, insertion-ordered map from `FieldName` to `T`.
///
/// Also stores a "label" for each entry, which may not be the same as the
/// FieldName in the case that the FieldName is a UUID.
///
/// This is called "row" because it's a short name, and it corresponds to the idea
/// of a row in a database, which is a map from fields to values.
///
/// Create this using the [FromIterator] implementation.
#[derive(Clone, PartialEq, Eq)]
pub struct Row<T>(Rc<IndexMap<FieldName, (LabelSegment, T)>>);

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

    /// Produce the empty row.
    pub fn empty() -> Self {
        Self(Rc::new(IndexMap::new()))
    }

    /// Map a function to produce a new row.
    pub fn map<S>(&self, f: impl Fn(&T) -> S) -> Row<S> {
        self.iter().map(|(name, (label, x))| (*name, (*label, f(x)))).collect()
    }
}

impl<T: Clone> Row<T> {
    ///  Insert a new field.
    ///
    /// Uses [Rc::make_mut] to mutate in place if there are no other references to self,
    /// otherwise performs a clone.
    pub fn insert(mut self, field: FieldName, label: LabelSegment, value: T) -> Self {
        Rc::make_mut(&mut self.0).insert(field, (label, value));
        self
    }
}

impl<T> FromIterator<(FieldName, (LabelSegment, T))> for Row<T> {
    fn from_iter<I>(iter: I) -> Self
    where
        I: IntoIterator<Item = (FieldName, (LabelSegment, T))>,
    {
        Row(Rc::new(iter.into_iter().collect()))
    }
}

impl<T> From<IndexMap<FieldName, (LabelSegment, T)>> for Row<T> {
    fn from(value: IndexMap<FieldName, (LabelSegment, T)>) -> Self {
        Self(Rc::new(value))
    }
}
