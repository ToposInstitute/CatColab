//! Rows.

use derivative::Derivative;
use derive_more::From;
use std::ops::Index;

use indexmap::IndexMap;

use super::qualified::{LabelSegment, NameSegment, label_seg, name_seg};
use ustr::Ustr;

/// An insertion-ordered map from `NameSegment` to `T`.
///
/// Also stores a "label" for each entry, which may not be the same as the
/// NameSegment in the case that the NameSegment is a UUID.
///
/// This is called "row" because it's a short name, and it corresponds to the idea
/// of a row in a database, which is a map from fields to values.
///
/// Create this using the [FromIterator] implementation.
#[derive(Clone, Derivative, PartialEq, Eq, From)]
#[derivative(Default(bound = ""))]
pub struct Row<T>(IndexMap<NameSegment, (LabelSegment, T)>);

impl<T> Index<NameSegment> for Row<T> {
    type Output = T;
    fn index(&self, index: NameSegment) -> &Self::Output {
        self.get(index).unwrap()
    }
}

impl<T> Row<T> {
    /// Lookup the field `name` if it exists.
    ///
    /// Also see the [Index] implementation, which just `unwrap`s this.
    pub fn get(&self, name: NameSegment) -> Option<&T> {
        self.0.get(&name).map(|p| &p.1)
    }

    /// Lookup the field `name` by mutable reference.
    pub fn get_mut(&mut self, name: NameSegment) -> Option<&mut T> {
        self.0.get_mut(&name).map(|p| &mut p.1)
    }

    /// Lookup the field `name` if it exists, and get its value and label.
    pub fn get_with_label(&self, name: NameSegment) -> Option<&(LabelSegment, T)> {
        self.0.get(&name)
    }

    /// Iterate through the fields in insertion order.
    pub fn iter(&self) -> impl Iterator<Item = (&NameSegment, &(LabelSegment, T))> {
        self.0.iter()
    }

    /// Return the number of fields.
    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// Return whether the row is empty.
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Return whether the row contains the given field.
    pub fn has(&self, field_name: NameSegment) -> bool {
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
    pub fn insert(&mut self, field: NameSegment, label: LabelSegment, value: T) {
        self.0.insert(field, (label, value));
    }
}

impl<T> FromIterator<(NameSegment, (LabelSegment, T))> for Row<T> {
    fn from_iter<I: IntoIterator<Item = (NameSegment, (LabelSegment, T))>>(iter: I) -> Self {
        Row(iter.into_iter().collect())
    }
}

impl<S: Clone + Into<Ustr>, T> FromIterator<(S, T)> for Row<T> {
    fn from_iter<I: IntoIterator<Item = (S, T)>>(iter: I) -> Self {
        iter.into_iter()
            .map(|(s, value)| (name_seg(s.clone()), (label_seg(s), value)))
            .collect()
    }
}
