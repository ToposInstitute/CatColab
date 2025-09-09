use crate::tt::prelude::*;
use std::ops::Index;

/// A sorted list of name-value pairs
#[derive(Clone)]
pub struct Row<T>(Rc<[(FieldName, T)]>);

impl<T> Index<FieldName> for Row<T> {
    type Output = T;
    fn index(&self, index: FieldName) -> &Self::Output {
        self.get(index).unwrap()
    }
}

impl<T> Row<T> {
    pub fn get(&self, name: FieldName) -> Option<&T> {
        if let Ok(i) = self.0.binary_search_by_key(&name, |(name, _)| *name) {
            Some(&self.0[i].1)
        } else {
            None
        }
    }

    pub fn iter(&self) -> impl Iterator<Item = &(FieldName, T)> {
        self.0.iter()
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn empty() -> Self {
        Self(Rc::new([]))
    }
}

impl<T> FromIterator<(FieldName, T)> for Row<T> {
    fn from_iter<I>(iter: I) -> Self
    where
        I: IntoIterator<Item = (FieldName, T)>,
    {
        let mut v: Vec<_> = iter.into_iter().collect();
        v.sort_by_key(|(f, _)| *f);
        Row(v.into())
    }
}
