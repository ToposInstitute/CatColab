use crate::tt::prelude::*;
use std::ops::Index;

/// A rigidly-ordered list of name-value pairs
#[derive(Clone)]
pub struct Tele<T>(Rc<[(FieldName, T)]>);

impl<T> Index<FieldName> for Tele<T> {
    type Output = T;
    fn index(&self, index: FieldName) -> &Self::Output {
        self.get(index).unwrap()
    }
}

impl<T> From<Vec<(FieldName, T)>> for Tele<T> {
    fn from(value: Vec<(FieldName, T)>) -> Self {
        Self(value.into())
    }
}

impl<T> Tele<T> {
    pub fn get(&self, name: FieldName) -> Option<&T> {
        if let Some((_, (_, v))) = self.0.iter().enumerate().find(|(_, (fname, _))| name == *fname)
        {
            Some(v)
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
}

impl<T> FromIterator<(FieldName, T)> for Tele<T> {
    fn from_iter<I>(iter: I) -> Self
    where
        I: IntoIterator<Item = (FieldName, T)>,
    {
        let mut v: Vec<_> = iter.into_iter().collect();
        v.into()
    }
}
