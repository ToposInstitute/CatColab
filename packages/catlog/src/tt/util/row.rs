/*! Rows. */
use crate::tt::prelude::*;
use std::ops::Index;

/** A cheaply cloneable, insertion-ordered map from `FieldName` to `T`.

This is called "row" because it's a short name, and it corresponds to the idea
of a row in a database, which is a map from fields to values.

Create this using the [FromIterator] implementation.
*/
#[derive(Clone, PartialEq, Eq)]
pub struct Row<T>(Rc<IndexMap<FieldName, T>>);

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
        self.0.get(&name)
    }

    /// Iterate through the fields in insertion order.
    pub fn iter(&self) -> impl Iterator<Item = (&FieldName, &T)> {
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

    /// Return whether the row contains the given field
    pub fn has(&self, field_name: FieldName) -> bool {
        self.0.contains_key(&field_name)
    }

    /// Produce the empty row.
    pub fn empty() -> Self {
        Self(Rc::new(IndexMap::new()))
    }
}

impl<T: Clone> Row<T> {
    /**  Insert a new field

    Uses [Rc::make_mut] to mutate in place if there are no other references to self,
    otherwise performs a clone.
    */
    pub fn insert(mut self, field: FieldName, value: T) -> Self {
        Rc::make_mut(&mut self.0).insert(field, value);
        self
    }
}

impl<T> FromIterator<(FieldName, T)> for Row<T> {
    fn from_iter<I>(iter: I) -> Self
    where
        I: IntoIterator<Item = (FieldName, T)>,
    {
        Row(Rc::new(iter.into_iter().collect()))
    }
}

impl<T> From<IndexMap<FieldName, T>> for Row<T> {
    fn from(value: IndexMap<FieldName, T>) -> Self {
        Self(Rc::new(value))
    }
}
